// AI副社長 抽出API
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAiVpOwner } from '@/lib/auth';
import { ExtractedJsonSchema, DEFAULT_EXTRACTED_JSON } from '@/types/ai-vp';
import type { IngestionSourceType, ExtractedJson } from '@/types/ai-vp';

const DEFAULT_TENANT_ID = 'defaultTenant';

// Claude抽出プロンプト
const EXTRACTION_PROMPT = `あなたは介護施設運営会社の情報抽出アシスタントです。
入力されたテキスト（会議の議事録、電話メモ、文字起こしなど）から、以下の情報を抽出してJSON形式で出力してください。

## 抽出対象

### 1. タスク（tasks）
- title: タスク名
- background: 背景・詳細（任意）
- ownerName: 担当者名（任意）
- ownerType: "staff" | "manager" | "unknown"（任意）
- dueDate: 期日（ISO日付形式、任意）
- urgency: "high" | "mid" | "low"（緊急度）
- importance: "high" | "mid" | "low"（重要度）
- category: "inquiry" | "resident" | "ringi" | "hiyarihat" | "kaizen" | "attendance" | "other"
- recommendedNextAction: 推奨アクション（任意）
- relatedEntities: 関連エンティティ配列（任意）
- confidence: 0-1の信頼度

### 2. エンティティ（entities）
- type: "resident" | "staff" | "facility" | "room" | "phone" | "email" | "company" | "other"
- value: 値
- normalizedValue: 正規化した値（任意）
- confidence: 0-1の信頼度

### 3. 提案レコード（proposedRecords）

#### inquiries（入居希望者）
- customerName: 顧客名
- age: 年齢
- gender: 性別
- careLevel: 介護度
- budget: 予算
- currentSituation: 現状
- desiredFacility: 希望施設
- tourRequestDate: 見学希望日
- salesCompanyName: 営業会社
- salesRepName: 担当者名
- otherNotes: その他メモ
- confidence: 0-1の信頼度

#### residentsUpdates（入居者更新）
- residentId: 入居者ID（任意）
- residentName: 入居者名
- updateFields: 更新フィールド
- reason: 理由
- confidence: 0-1の信頼度

#### ringi（稟議）
- title: 件名
- category: カテゴリ
- body: 本文
- amount: 金額（任意）
- confidence: 0-1の信頼度

#### hiyarihat（ヒヤリハット）
- date: 発生日
- timeSlot: 時間帯
- category: カテゴリ
- severity: 重大度（1-5）
- body: 内容
- action: 対応（任意）
- prevention: 再発防止策（任意）
- confidence: 0-1の信頼度

#### kaizen（改善アイデア）
- title: タイトル
- body: 内容
- category: カテゴリ（任意）
- confidence: 0-1の信頼度

### 4. アラート（alerts）

#### lineworks（LINE WORKS通知）
- message: メッセージ
- urgency: "high" | "mid" | "low"

#### spreadsheet（スプレッドシート書き込み）
- sheetName: シート名（任意）
- rowData: 行データ

## 出力形式

必ず以下のJSON構造で出力してください：

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

- 明確に言及されている情報のみを抽出してください
- 推測や補完は最小限にし、信頼度（confidence）を適切に設定してください
- 日付はISO 8601形式（YYYY-MM-DD）で出力してください
- 緊急性が高い情報はalertsにも含めてください
- JSONのみを出力し、説明文は不要です`;

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
        // JSONを抽出
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          // Zodスキーマで検証
          const parseResult = ExtractedJsonSchema.safeParse(parsed);
          if (parseResult.success) {
            extractedJson = parseResult.data;
          } else {
            console.error('JSON schema validation failed:', parseResult.error);
            // 部分的に有効なデータを使用
            extractedJson = {
              tasks: parsed.tasks || [],
              entities: parsed.entities || [],
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
