// AI副社長 抽出API
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAiVpOwner } from '@/lib/auth';
import { ExtractedJsonSchema, DEFAULT_EXTRACTED_JSON } from '@/types/ai-vp';
import type { IngestionSourceType, ExtractedJson } from '@/types/ai-vp';

const DEFAULT_TENANT_ID = 'defaultTenant';

// Claude抽出プロンプト（v2: few-shot付き、信頼度ガイドライン、介護施設ドメイン最適化）
const EXTRACTION_PROMPT = `あなたは介護施設運営会社「飛鳥グループ」の情報抽出アシスタントです。
入力テキスト（議事録、電話メモ、文字起こし等）から情報を抽出し、JSON形式で出力します。

## 信頼度（confidence）ガイドライン
- **0.9-1.0**: テキストに明示的に記載されている情報（名前、日付、金額等）
- **0.7-0.89**: 文脈から高い確度で推定できる情報（「来週中に」→具体的日付）
- **0.5-0.69**: 文脈から推定可能だが曖昧な情報（「そのうち対応」→urgency推定）
- **0.3-0.49**: 間接的な言及から推測した情報（背景情報からの補完）
- **0.5未満の抽出は原則不要**: 確度が低い情報は抽出しない

## 抽出対象

### 1. タスク（tasks）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| title | string | ✓ | 具体的なアクション（「〜する」形式） |
| background | string | | 背景・詳細 |
| ownerName | string | | 担当者名（テキスト中の人名） |
| ownerType | enum | | "staff" / "manager" / "unknown" |
| dueDate | string | | ISO日付（YYYY-MM-DD） |
| urgency | enum | ✓ | "high"=今日〜3日以内 / "mid"=1週間以内 / "low"=それ以降 |
| importance | enum | ✓ | "high"=経営・安全・法令 / "mid"=業務影響 / "low"=改善・希望 |
| category | enum | ✓ | "inquiry" / "resident" / "ringi" / "hiyarihat" / "kaizen" / "attendance" / "other" |
| recommendedNextAction | string | | 次のアクション |
| confidence | number | ✓ | 0-1 |

### 2. エンティティ（entities）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| type | enum | ✓ | "resident" / "staff" / "facility" / "room" / "phone" / "email" / "company" / "other" |
| value | string | ✓ | 原文のまま |
| normalizedValue | string | | 正規化値（電話番号→ハイフン付き等） |
| confidence | number | ✓ | 0-1 |

### 3. 提案レコード（proposedRecords）

#### inquiries - 入居希望者
customerName(✓), age, gender, careLevel(介護度), budget, currentSituation, desiredFacility, tourRequestDate, salesCompanyName, salesRepName, otherNotes, confidence(✓)

#### residentsUpdates - 入居者更新
residentName(✓), updateFields(✓), reason, confidence(✓)

#### ringi - 稟議
title(✓), category, body(✓), amount, confidence(✓)

#### hiyarihat - ヒヤリハット
date(✓), timeSlot, category, severity(1-5: 1=ヒヤリ, 3=軽微事故, 5=重大事故), body(✓), action, prevention, confidence(✓)

#### kaizen - 改善
title(✓), body(✓), category, confidence(✓)

### 4. アラート（alerts）
- lineworks: { message(✓), urgency(✓) } - 即時通知が必要な情報
- spreadsheet: { sheetName, rowData(✓) } - 記録用データ

## Few-Shot例

### 入力例1（朝礼メモ）
「昨日Aフロアで田中さんが車椅子移乗中にバランス崩してヒヤリ。怪我はなし。鈴木リーダーが対応。あと、来週月曜に紹介会社のメディカルサポートさんから佐藤様（78歳女性、要介護3）の見学予約入ってます。予算は月15万くらい。それと、2Fの手すりがグラグラしてるから修繕お願いしたい。」

### 出力例1
\`\`\`json
{
  "tasks": [
    {
      "title": "2F手すりの修繕を手配する",
      "background": "2Fの手すりがグラグラしている",
      "urgency": "mid",
      "importance": "high",
      "category": "other",
      "recommendedNextAction": "修繕チケットを作成し業者手配",
      "confidence": 0.95
    }
  ],
  "entities": [
    { "type": "resident", "value": "田中さん", "confidence": 0.9 },
    { "type": "staff", "value": "鈴木リーダー", "confidence": 0.95 },
    { "type": "company", "value": "メディカルサポート", "confidence": 0.95 },
    { "type": "facility", "value": "Aフロア", "confidence": 0.9 },
    { "type": "facility", "value": "2F", "confidence": 0.85 }
  ],
  "proposedRecords": {
    "inquiries": [
      {
        "customerName": "佐藤様",
        "age": 78,
        "gender": "女性",
        "careLevel": "要介護3",
        "budget": "月15万円",
        "salesCompanyName": "メディカルサポート",
        "tourRequestDate": "来週月曜",
        "confidence": 0.9
      }
    ],
    "residentsUpdates": [],
    "ringi": [],
    "hiyarihat": [
      {
        "date": "昨日",
        "category": "転倒・転落",
        "severity": 1,
        "body": "Aフロアで田中さんが車椅子移乗中にバランスを崩した。怪我なし。",
        "action": "鈴木リーダーが対応",
        "confidence": 0.95
      }
    ],
    "kaizen": []
  },
  "alerts": {
    "lineworks": [
      { "message": "【見学予約】佐藤様（78歳女性/要介護3）来週月曜 - メディカルサポート紹介", "urgency": "mid" }
    ],
    "spreadsheet": []
  }
}
\`\`\`

### 入力例2（電話メモ）
「西淀川の家族の山本さんから電話。お母様の体調が悪化、嘔吐が続いている。主治医に連絡済み。往診お願いしたとのこと。」

### 出力例2
\`\`\`json
{
  "tasks": [
    {
      "title": "山本様のお母様の往診結果を確認する",
      "background": "嘔吐が続いており主治医に往診依頼済み",
      "ownerType": "manager",
      "urgency": "high",
      "importance": "high",
      "category": "resident",
      "recommendedNextAction": "往診後の状況を家族に報告",
      "confidence": 0.9
    }
  ],
  "entities": [
    { "type": "staff", "value": "山本さん", "normalizedValue": "山本（家族）", "confidence": 0.85 },
    { "type": "facility", "value": "西淀川", "confidence": 0.95 }
  ],
  "proposedRecords": {
    "inquiries": [],
    "residentsUpdates": [
      {
        "residentName": "山本様のお母様",
        "updateFields": "体調悪化（嘔吐が続く）、主治医に往診依頼済み",
        "reason": "家族からの電話報告",
        "confidence": 0.85
      }
    ],
    "ringi": [],
    "hiyarihat": [],
    "kaizen": []
  },
  "alerts": {
    "lineworks": [
      { "message": "【緊急】西淀川・山本様のお母様が体調悪化（嘔吐）。主治医に往診依頼済み。経過観察要。", "urgency": "high" }
    ],
    "spreadsheet": []
  }
}
\`\`\`

## 出力形式

必ず以下のJSON構造で出力してください。JSONのみを出力し、前後に説明文を付けないでください。

{
  "tasks": [],
  "entities": [],
  "proposedRecords": {
    "inquiries": [],
    "residentsUpdates": [],
    "ringi": [],
    "hiyarihat": [],
    "kaizen": []
  },
  "alerts": {
    "lineworks": [],
    "spreadsheet": []
  }
}

## 注意事項
- 明確に言及されている情報のみを抽出。推測は最小限に。
- 信頼度ガイドラインに従い、0.5未満の項目は除外。
- 日付はISO 8601形式（YYYY-MM-DD）。「昨日」「来週」等はそのまま記載可。
- 緊急性が高い情報（怪我・事故・体調急変等）はalertsにも必ず含める。
- severity基準: 1=ヒヤリのみ, 2=軽微（打撲等）, 3=要受診, 4=救急搬送, 5=重大（骨折・意識喪失等）`;

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // AI副社長オーナーチェック
    if (!isAiVpOwner(decodedToken.email)) {
      return NextResponse.json({ error: 'AI副社長へのアクセス権限がありません' }, { status: 403 });
    }

    // リクエストボディ解析
    const body = await request.json();
    const {
      sourceType = 'text' as IngestionSourceType,
      rawText,
      sourceMeta = {},
    } = body;

    if (!rawText || typeof rawText !== 'string') {
      return NextResponse.json({ error: 'rawTextは必須です' }, { status: 400 });
    }

    if (rawText.length > 100000) {
      return NextResponse.json({ error: 'テキストが長すぎます（最大100,000文字）' }, { status: 400 });
    }

    // ユーザー情報取得
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userName = userData?.name || userData?.displayName || decodedToken.email || 'Unknown';

    // 1. 取り込み（Ingestion）を作成
    const ingestionData = {
      tenantId: DEFAULT_TENANT_ID,
      sourceType,
      sourceMeta,
      rawText,
      createdByUserId: decodedToken.uid,
      createdByUserName: userName,
      createdAt: FieldValue.serverTimestamp(),
    };

    const ingestionRef = await getAdminDb().collection('aiVpIngestions').add(ingestionData);

    // 監査ログ
    await getAdminDb().collection('aiVpAuditLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      actorUserId: decodedToken.uid,
      actorUserName: userName,
      eventType: 'ingestion_created',
      eventMeta: {
        ingestionId: ingestionRef.id,
        sourceType,
        textLength: rawText.length,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2. Claude APIで抽出
    let extractedJson: ExtractedJson = DEFAULT_EXTRACTED_JSON;
    let summaryText = '';
    let tokenUsage = { input: 0, output: 0 };

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY is not set');
      return NextResponse.json({ error: 'API設定エラー' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey: anthropicApiKey });

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: `${EXTRACTION_PROMPT}\n\n---\n\n入力テキスト:\n${rawText}`,
          },
        ],
      });

      // トークン使用量記録
      tokenUsage = {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0,
      };

      // レスポンス解析
      const content = response.content[0];
      if (content.type === 'text') {
        // JSONを抽出（コードブロック内のJSON or 生JSON の両方に対応）
        let jsonText: string | null = null;
        const codeBlockMatch = content.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1];
        } else {
          // 最も外側のJSONオブジェクトを抽出（ネスト対応）
          const firstBrace = content.text.indexOf('{');
          if (firstBrace >= 0) {
            let depth = 0;
            let lastBrace = -1;
            for (let i = firstBrace; i < content.text.length; i++) {
              if (content.text[i] === '{') depth++;
              else if (content.text[i] === '}') {
                depth--;
                if (depth === 0) { lastBrace = i; break; }
              }
            }
            if (lastBrace > firstBrace) {
              jsonText = content.text.slice(firstBrace, lastBrace + 1);
            }
          }
        }

        if (jsonText) {
          const parsed = JSON.parse(jsonText);

          // Zodスキーマで検証
          const parseResult = ExtractedJsonSchema.safeParse(parsed);
          if (parseResult.success) {
            extractedJson = parseResult.data;
          } else {
            console.warn('JSON schema validation warnings:', parseResult.error.issues.map(i => i.message).join(', '));
            // 部分的に有効なデータを使用（各配列を個別に検証）
            extractedJson = {
              tasks: Array.isArray(parsed.tasks)
                ? parsed.tasks.filter((t: Record<string, unknown>) => t.title && t.confidence !== undefined)
                : [],
              entities: Array.isArray(parsed.entities)
                ? parsed.entities.filter((e: Record<string, unknown>) => e.type && e.value)
                : [],
              proposedRecords: {
                inquiries: parsed.proposedRecords?.inquiries || [],
                residentsUpdates: parsed.proposedRecords?.residentsUpdates || [],
                ringi: parsed.proposedRecords?.ringi || [],
                hiyarihat: parsed.proposedRecords?.hiyarihat || [],
                kaizen: parsed.proposedRecords?.kaizen || [],
              },
              alerts: {
                lineworks: parsed.alerts?.lineworks || [],
                spreadsheet: parsed.alerts?.spreadsheet || [],
              },
            };
          }
        }
      }

      // サマリー生成
      const taskCount = extractedJson.tasks.length;
      const entityCount = extractedJson.entities.length;
      const inquiryCount = extractedJson.proposedRecords.inquiries.length;
      const hiyarihatCount = extractedJson.proposedRecords.hiyarihat.length;
      const kaizenCount = extractedJson.proposedRecords.kaizen.length;
      const ringiCount = extractedJson.proposedRecords.ringi.length;

      summaryText = `抽出完了: タスク${taskCount}件, エンティティ${entityCount}件`;
      if (inquiryCount > 0) summaryText += `, 入居希望者${inquiryCount}件`;
      if (hiyarihatCount > 0) summaryText += `, ヒヤリハット${hiyarihatCount}件`;
      if (kaizenCount > 0) summaryText += `, 改善アイデア${kaizenCount}件`;
      if (ringiCount > 0) summaryText += `, 稟議${ringiCount}件`;

    } catch (aiError) {
      console.error('Claude API error:', aiError);

      // 失敗時も抽出レコードを作成（失敗状態で）
      const extractionData = {
        tenantId: DEFAULT_TENANT_ID,
        ingestionId: ingestionRef.id,
        extractionVersion: 1,
        status: 'failed',
        modelMeta: {
          modelName: 'claude-sonnet-4-20250514',
          promptHash: 'v1',
          tokenUsage,
        },
        extractedJson: DEFAULT_EXTRACTED_JSON,
        summaryText: '',
        errorText: aiError instanceof Error ? aiError.message : 'AI抽出エラー',
        createdAt: FieldValue.serverTimestamp(),
      };

      const extractionRef = await getAdminDb().collection('aiVpExtractions').add(extractionData);

      // 監査ログ
      await getAdminDb().collection('aiVpAuditLogs').add({
        tenantId: DEFAULT_TENANT_ID,
        actorUserId: decodedToken.uid,
        actorUserName: userName,
        eventType: 'extraction_failed',
        eventMeta: {
          extractionId: extractionRef.id,
          ingestionId: ingestionRef.id,
          error: aiError instanceof Error ? aiError.message : 'Unknown error',
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        error: 'AI抽出に失敗しました',
        ingestionId: ingestionRef.id,
        extractionId: extractionRef.id,
      }, { status: 500 });
    }

    // 3. 抽出（Extraction）を作成
    const extractionData = {
      tenantId: DEFAULT_TENANT_ID,
      ingestionId: ingestionRef.id,
      extractionVersion: 1,
      status: 'draft',
      modelMeta: {
        modelName: 'claude-sonnet-4-20250514',
        promptHash: 'v1',
        tokenUsage,
      },
      extractedJson,
      summaryText,
      createdAt: FieldValue.serverTimestamp(),
    };

    const extractionRef = await getAdminDb().collection('aiVpExtractions').add(extractionData);

    // 監査ログ
    await getAdminDb().collection('aiVpAuditLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      actorUserId: decodedToken.uid,
      actorUserName: userName,
      eventType: 'extraction_completed',
      eventMeta: {
        extractionId: extractionRef.id,
        ingestionId: ingestionRef.id,
        taskCount: extractedJson.tasks.length,
        entityCount: extractedJson.entities.length,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      ingestionId: ingestionRef.id,
      extractionId: extractionRef.id,
      summary: summaryText,
      extractedJson,
      tokenUsage,
    });

  } catch (error) {
    console.error('AI VP extract API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
