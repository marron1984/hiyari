// AI副社長 申請レビューAPI
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAiVpOwner } from '@/lib/auth';
import { createApprovalTask, isGoogleTasksConfigured } from '@/lib/google-tasks';
import { buildFeaturePrompt } from '@/lib/ai-vp-persona';

const DEFAULT_TENANT_ID = 'defaultTenant';

// approval_comment ペルソナルールを使ったレビュープロンプト
const REVIEW_USER_PROMPT = `以下の申請データをレビューし、判断支援情報を整理してください。

## あなたの行動
1. 申請内容の整形・要約
2. 不足情報の指摘
3. 類似案件との比較（提供された場合）
4. 判断ポイントの抽出
5. 選択肢の整理（承認する場合/差し戻す場合/却下する場合の各影響）

## 判断基準
- 金額の妥当性（市場価格との比較）
- 緊急性と必要性のバランス
- 予算への影響
- 法令遵守
- 会社方針との整合性

## 出力形式（JSON）

{
  "formattedSummary": "申請の要約（2-3文）事実ベースで記述",
  "extractedKeyPoints": ["キーポイント1", "キーポイント2"],
  "options": {
    "approve": "承認した場合の影響・条件の整理",
    "return": "差し戻した場合の確認事項",
    "reject": "却下した場合の影響"
  },
  "confidence": 0.85,
  "reasoning": "判断材料の整理（推奨ではなく事実・比較の提示）",
  "attentionPoints": ["注意点1", "注意点2"],
  "suggestedConditions": ["条件1（承認する場合に必要な条件）"],
  "missingFields": ["不足フィールド1"],
  "validationWarnings": ["警告1"],
  "similarCasesSummary": "類似案件の承認率・否認率の要約（データがある場合）"
}

## 注意事項
- 最終決裁は吉田が行う。あなたは「選択肢の整理」のみ行う
- 「〜すべき」「〜を推奨」「〜がベスト」は使わない
- 「〜の可能性がある」「〜と考えられる」「データによると〜」を使う
- 不確実な場合はconfidenceを低くする
- 法的リスクがある場合は必ずattentionPointsに含める
- JSONのみを出力し、説明文は不要`;

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

    // AI副社長オーナーまたは管理者チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';
    const isAdmin = ['admin', 'system_admin'].includes(userRole);

    if (!isAiVpOwner(decodedToken.email) && !isAdmin) {
      return NextResponse.json({ error: 'AI副社長レビューへのアクセス権限がありません' }, { status: 403 });
    }

    const userName = userData?.name || userData?.displayName || decodedToken.email || 'Unknown';

    // リクエストボディ解析
    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json({ error: 'requestIdは必須です' }, { status: 400 });
    }

    // 申請データ取得
    const requestDoc = await getAdminDb().collection('requests').doc(requestId).get();
    if (!requestDoc.exists) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
    }

    const requestData = requestDoc.data();

    // 類似案件検索
    const similarCases = await findSimilarCases(requestData);

    // Claude APIでレビュー
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json({ error: 'API設定エラー' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey: anthropicApiKey });

    // 入力データ構築
    const inputData = {
      request: {
        type: requestData?.requestType,
        title: requestData?.title,
        description: requestData?.description,
        category: requestData?.category,
        amount: requestData?.totalAmount,
        taxType: requestData?.taxType,
        urgency: requestData?.urgency,
        isEmergency: requestData?.isEmergency,
        applicantName: requestData?.applicantName,
        applicantDepartment: requestData?.applicantDepartment,
      },
      similarCases: similarCases.map((c) => ({
        title: c.title,
        amount: c.totalAmount,
        status: c.status,
        category: c.category,
      })),
    };

    const startTime = Date.now();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: buildFeaturePrompt('approval_comment'),
      messages: [
        {
          role: 'user',
          content: `${REVIEW_USER_PROMPT}\n\n---\n\n申請データ:\n${JSON.stringify(inputData, null, 2)}`,
        },
      ],
    });

    const processingTimeMs = Date.now() - startTime;

    // トークン使用量
    const tokenUsage = {
      input: response.usage?.input_tokens || 0,
      output: response.usage?.output_tokens || 0,
    };

    // レスポンス解析
    let reviewResult = {
      formattedSummary: '',
      extractedKeyPoints: [] as string[],
      options: { approve: '', return: '', reject: '' } as Record<string, string>,
      confidence: 0.5,
      reasoning: '',
      attentionPoints: [] as string[],
      suggestedConditions: [] as string[],
      missingFields: [] as string[],
      validationWarnings: [] as string[],
      similarCasesSummary: '',
    };

    const content = response.content[0];
    if (content.type === 'text') {
      // コードブロック対応のJSONパース
      const codeBlockMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = codeBlockMatch ? codeBlockMatch[1] : content.text;
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          reviewResult = {
            formattedSummary: parsed.formattedSummary || '',
            extractedKeyPoints: parsed.extractedKeyPoints || [],
            options: parsed.options || { approve: '', return: '', reject: '' },
            confidence: parsed.confidence || 0.5,
            reasoning: parsed.reasoning || '',
            attentionPoints: parsed.attentionPoints || [],
            suggestedConditions: parsed.suggestedConditions || [],
            missingFields: parsed.missingFields || [],
            validationWarnings: parsed.validationWarnings || [],
            similarCasesSummary: parsed.similarCasesSummary || '',
          };
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
        }
      }
    }

    // レビュー結果を申請に保存
    const aiVpReview = {
      reviewedAt: FieldValue.serverTimestamp(),
      modelVersion: 'claude-sonnet-4-20250514',
      ...reviewResult,
      similarCases: similarCases.map((c) => ({
        requestId: c.id,
        requestNumber: c.requestNumber,
        title: c.title,
        amount: c.totalAmount,
        status: c.status,
        decidedAt: c.completedAt,
        similarity: computeSimilarity(requestData, c),
      })),
      processingTimeMs,
      tokenUsage,
    };

    await getAdminDb().collection('requests').doc(requestId).update({
      aiVpReview,
      status: 'ai_vp_reviewed',
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'ai_vp',
    });

    // 承認ログ記録
    await getAdminDb().collection('approvalLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      requestId,
      requestNumber: requestData?.requestNumber || '',
      action: 'ai_review',
      fromStatus: requestData?.status,
      toStatus: 'ai_vp_reviewed',
      actorId: 'ai_vp',
      actorName: '吉田',
      actorRole: 'ai_vp',
      isAiVp: true,
      comment: reviewResult.formattedSummary,
      createdAt: FieldValue.serverTimestamp(),
    });

    // AI VP監査ログ
    await getAdminDb().collection('aiVpAuditLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      actorUserId: decodedToken.uid,
      actorUserName: userName,
      eventType: 'request_reviewed',
      eventMeta: {
        requestId,
        confidence: reviewResult.confidence,
        processingTimeMs,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    // Google Tasks連携（設定されている場合のみ）
    let taskSyncResult = null;
    if (isGoogleTasksConfigured()) {
      try {
        taskSyncResult = await createApprovalTask(
          requestId,
          requestData?.requestNumber || '',
          requestData?.title || '',
          requestData?.totalAmount || 0,
          requestData?.applicantName || ''
        );
        if (taskSyncResult) {
          console.log('Google Task created:', taskSyncResult.googleTaskId);
        }
      } catch (taskError) {
        console.error('Failed to create Google Task (non-blocking):', taskError);
        // Google Tasks作成失敗はレビュー自体のエラーにはしない
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      review: aiVpReview,
      taskSynced: !!taskSyncResult,
    });

  } catch (error) {
    console.error('AI VP review API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 類似度を計算（カテゴリ一致、金額近似、タイトルのトークン重複）
 * 0〜1 のスコアを返す
 */
function computeSimilarity(
  current: FirebaseFirestore.DocumentData | undefined,
  candidate: Record<string, unknown>
): number {
  if (!current) return 0;

  let score = 0;
  let weights = 0;

  // カテゴリ一致 (重み 0.3)
  if (current.category && candidate.category) {
    score += current.category === candidate.category ? 0.3 : 0;
  }
  weights += 0.3;

  // 申請種別一致 (重み 0.2)
  if (current.requestType && candidate.requestType) {
    score += current.requestType === candidate.requestType ? 0.2 : 0;
  }
  weights += 0.2;

  // 金額近似 (重み 0.25)
  const curAmount = Number(current.totalAmount) || 0;
  const canAmount = Number(candidate.totalAmount) || 0;
  if (curAmount > 0 && canAmount > 0) {
    const ratio = Math.min(curAmount, canAmount) / Math.max(curAmount, canAmount);
    score += ratio * 0.25;
  }
  weights += 0.25;

  // タイトルトークン重複 (重み 0.25)
  const curTitle = String(current.title || '');
  const canTitle = String(candidate.title || '');
  if (curTitle && canTitle) {
    const curTokens = new Set(curTitle.split(/[\s　、。・]+/).filter(Boolean));
    const canTokens = new Set(canTitle.split(/[\s　、。・]+/).filter(Boolean));
    if (curTokens.size > 0 && canTokens.size > 0) {
      let overlap = 0;
      for (const t of curTokens) {
        if (canTokens.has(t)) overlap++;
      }
      const jaccard = overlap / (curTokens.size + canTokens.size - overlap);
      score += jaccard * 0.25;
    }
  }
  weights += 0.25;

  return weights > 0 ? Math.round((score / weights) * 100) / 100 : 0;
}

/**
 * 類似案件を検索
 */
async function findSimilarCases(requestData: FirebaseFirestore.DocumentData | undefined): Promise<any[]> {
  if (!requestData) return [];

  try {
    // 同じカテゴリ・類似金額の過去案件を検索
    const snapshot = await getAdminDb()
      .collection('requests')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .where('status', 'in', ['final_approved_by_yoshida', 'executed', 'rejected'])
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    // クライアントサイドでフィルタリング
    const similar = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((r: any) => {
        // 同じカテゴリ
        if (r.category === requestData.category) return true;
        // 同じ申請種別で金額が近い（±50%）
        if (r.requestType === requestData.requestType) {
          const ratio = r.totalAmount / requestData.totalAmount;
          if (ratio >= 0.5 && ratio <= 2.0) return true;
        }
        return false;
      })
      .slice(0, 5);

    return similar;
  } catch (error) {
    console.error('Similar cases search error:', error);
    return [];
  }
}
