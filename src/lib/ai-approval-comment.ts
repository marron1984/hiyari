// ======== AI副社長・申請承認補助コメント生成ロジック ========

import { getAdminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import {
  AiApprovalComment,
  AiApprovalCommentInput,
  AiApprovalCommentOutput,
  ApprovalHistoryItem,
  AI_APPROVAL_COMMENT_PROMPT_VERSION,
} from '@/types/ai-approval-comment';
import { toDate } from './date';

const AI_COMMENTS_COLLECTION = 'aiApprovalComments';
const APPLICATIONS_COLLECTION = 'applications';
const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== 履歴データ取得 ========

/**
 * 類似申請の承認履歴を取得
 */
export async function getSimilarApprovalHistory(
  applicationType: 'EXPENSE' | 'OVERTIME',
  baseId: string,
  limitCount: number = 50
): Promise<ApprovalHistoryItem[]> {
  const db = getAdminDb();

  // 承認済みまたは却下済みの申請を取得
  const snapshot = await db
    .collection(APPLICATIONS_COLLECTION)
    .where('type', '==', applicationType)
    .where('status', 'in', ['approved', 'rejected'])
    .orderBy('createdAt', 'desc')
    .limit(limitCount * 2)
    .get();

  const history: ApprovalHistoryItem[] = [];

  snapshot.docs.forEach((doc) => {
    const data = doc.data();

    // 同一拠点の申請を優先
    history.push({
      applicationId: doc.id,
      finalDecision: data.status as 'approved' | 'rejected',
      approveReasonCode: data.approvalComment || data.rejectionReason,
      amount: data.payload?.amount || data.payload?.hours,
      reasonText: data.payload?.description || data.payload?.reason || '',
      baseId: data.branchId,
      createdAt: toDate(data.createdAt)?.toISOString() || new Date().toISOString(),
      decidedBy: data.approvedBy || data.rejectedBy,
    });
  });

  // 同一拠点を優先してソート
  return history
    .sort((a, b) => {
      if (a.baseId === baseId && b.baseId !== baseId) return -1;
      if (a.baseId !== baseId && b.baseId === baseId) return 1;
      return 0;
    })
    .slice(0, limitCount);
}

// ======== AI プロンプト生成 ========

/**
 * AI用のプロンプトを生成
 */
function buildAiPrompt(input: AiApprovalCommentInput): string {
  const typeLabel = input.application.type === 'EXPENSE' ? '経費申請' : '残業申請';

  // 履歴から統計を計算
  const approvedCount = input.history.filter((h) => h.finalDecision === 'approved').length;
  const rejectedCount = input.history.filter((h) => h.finalDecision === 'rejected').length;
  const totalCount = approvedCount + rejectedCount;

  const approvalRate = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 50;
  const rejectionRate = totalCount > 0 ? Math.round((rejectedCount / totalCount) * 100) : 50;

  // 類似ケースを抽出（金額や理由が近いもの）
  const similarCases = input.history
    .filter((h) => {
      if (input.application.type === 'EXPENSE') {
        const diff = Math.abs((h.amount || 0) - (input.application.amount || 0));
        return diff < (input.application.amount || 10000) * 0.5; // 50%以内
      }
      return true;
    })
    .slice(0, 10);

  const similarApproved = similarCases.filter((h) => h.finalDecision === 'approved').length;
  const similarRejected = similarCases.filter((h) => h.finalDecision === 'rejected').length;
  const similarTotal = similarApproved + similarRejected;

  return `あなたはAI副社長として、${typeLabel}の承認判断を補助します。

【重要ルール】
- 承認/否認の判断はしない。
- 提案口調は禁止（「〜すべき」「〜してください」は使わない）。
- 「不足情報」と「傾向」だけを返す。
- 注意点は最大2つまで。断定禁止（「〜かもしれません」「〜の可能性があります」を使う）。

【現在の申請】
種別: ${typeLabel}
申請者: ${input.application.applicantName}
拠点: ${input.application.baseId}
${input.application.amount ? `金額/時間: ${input.application.amount}` : ''}
理由: ${input.application.reasonText}
${input.application.category ? `カテゴリ: ${input.application.category}` : ''}
${input.application.datetimeRange?.date ? `日付: ${input.application.datetimeRange.date}` : ''}
${input.application.datetimeRange?.startTime ? `時間: ${input.application.datetimeRange.startTime} - ${input.application.datetimeRange.endTime}` : ''}
添付: ${input.application.attachmentsMeta?.hasReceipts ? `領収書${input.application.attachmentsMeta.receiptCount}枚` : 'なし'}

【過去の承認傾向】
全体: 承認${approvalRate}% / 否認${rejectionRate}%（${totalCount}件中）
類似案件: 承認${similarTotal > 0 ? Math.round((similarApproved / similarTotal) * 100) : 50}% / 否認${similarTotal > 0 ? Math.round((similarRejected / similarTotal) * 100) : 50}%（${similarTotal}件中）

【参考ケース（直近3件）】
${similarCases.slice(0, 3).map((c, i) => `${i + 1}. [${c.applicationId.slice(-6)}] ${c.finalDecision === 'approved' ? '承認' : '否認'} - ${c.reasonText?.slice(0, 30) || '理由なし'}`).join('\n')}

【出力フォーマット】
以下のJSON形式で出力してください:
{
  "similarApprovalRate": ${similarTotal > 0 ? Math.round((similarApproved / similarTotal) * 100) : 50},
  "similarRejectionRate": ${similarTotal > 0 ? Math.round((similarRejected / similarTotal) * 100) : 50},
  "referenceCaseIds": ${JSON.stringify(similarCases.slice(0, 3).map((c) => c.applicationId))},
  "missingInfo": ["不足している情報1", "不足している情報2"],
  "cautions": ["注意点1（断定禁止）", "注意点2（断定禁止）"]
}

【不足情報の例】
- 経費申請: 領収書の添付、内訳の詳細、支払先の記載、利用目的の記載
- 残業申請: 作業内容の詳細、上長の事前承認、勤怠記録との整合

【注意点の書き方】
× 「この申請は問題がある」（断定禁止）
○ 「類似ケースでは否認されたことがあるかもしれません」
○ 「金額が通常より高い可能性があります」`;
}

/**
 * AIでコメントを生成
 */
async function generateAiComment(input: AiApprovalCommentInput): Promise<AiApprovalCommentOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // デフォルト値
  const defaultOutput: AiApprovalCommentOutput = {
    similarApprovalRate: 50,
    similarRejectionRate: 50,
    referenceCaseIds: [],
    missingInfo: [],
    cautions: [],
  };

  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, using default output');
    return defaultOutput;
  }

  const client = new Anthropic({ apiKey });
  const prompt = buildAiPrompt(input);

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const rawResponse =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // JSONをパース
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          similarApprovalRate: parsed.similarApprovalRate || 50,
          similarRejectionRate: parsed.similarRejectionRate || 50,
          referenceCaseIds: (parsed.referenceCaseIds || []).slice(0, 3),
          missingInfo: parsed.missingInfo || [],
          cautions: (parsed.cautions || []).slice(0, 2),
        };
      } catch {
        console.error('Failed to parse AI response JSON');
      }
    }

    return defaultOutput;
  } catch (error) {
    console.error('AI API error:', error);
    return defaultOutput;
  }
}

// ======== メイン処理 ========

/**
 * 申請のAI承認補助コメントを生成
 */
export async function generateApprovalComment(
  applicationId: string,
  userId: string = 'system',
  isRegenerated: boolean = false
): Promise<AiApprovalComment> {
  const db = getAdminDb();

  // 申請を取得
  const appDoc = await db.collection(APPLICATIONS_COLLECTION).doc(applicationId).get();
  if (!appDoc.exists) {
    throw new Error('申請が見つかりません');
  }

  const appData = appDoc.data()!;
  const applicationType = appData.type as 'EXPENSE' | 'OVERTIME';

  // 履歴を取得
  const history = await getSimilarApprovalHistory(
    applicationType,
    appData.branchId,
    50
  );

  // AI入力を構築
  const input: AiApprovalCommentInput = {
    application: {
      id: applicationId,
      type: applicationType,
      baseId: appData.branchId,
      applicantId: appData.authorId,
      applicantName: appData.authorName,
      amount: appData.payload?.amount || appData.payload?.hours,
      reasonText: appData.payload?.description || appData.payload?.reason || appData.payload?.workContent || '',
      datetimeRange: applicationType === 'OVERTIME' ? {
        date: appData.payload?.date,
        startTime: appData.payload?.startTime,
        endTime: appData.payload?.endTime,
      } : undefined,
      category: appData.payload?.category,
      attachmentsMeta: {
        hasReceipts: (appData.payload?.receiptUrls?.length || 0) > 0,
        receiptCount: appData.payload?.receiptUrls?.length || 0,
      },
      createdAt: toDate(appData.createdAt)?.toISOString() || new Date().toISOString(),
    },
    history,
  };

  // AIコメントを生成
  const aiOutput = await generateAiComment(input);

  // コメントを構築
  const comment: AiApprovalComment = {
    tenantId: appData.tenantId || DEFAULT_TENANT_ID,
    applicationId,
    applicationType,
    promptVersion: AI_APPROVAL_COMMENT_PROMPT_VERSION,
    similarApprovalRate: aiOutput.similarApprovalRate,
    similarRejectionRate: aiOutput.similarRejectionRate,
    referenceCaseIds: aiOutput.referenceCaseIds,
    missingInfo: aiOutput.missingInfo,
    cautions: aiOutput.cautions,
    createdAt: new Date(),
    createdBy: userId,
    isRegenerated,
  };

  // Firestoreに保存
  const docRef = await db.collection(AI_COMMENTS_COLLECTION).add({
    ...comment,
    createdAt: Timestamp.now(),
  });

  comment.id = docRef.id;

  return comment;
}

/**
 * 申請のAIコメントを取得（最新）
 */
export async function getApprovalComment(
  applicationId: string
): Promise<AiApprovalComment | null> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(AI_COMMENTS_COLLECTION)
    .where('applicationId', '==', applicationId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    tenantId: data.tenantId,
    applicationId: data.applicationId,
    applicationType: data.applicationType,
    promptVersion: data.promptVersion,
    similarApprovalRate: data.similarApprovalRate,
    similarRejectionRate: data.similarRejectionRate,
    referenceCaseIds: data.referenceCaseIds || [],
    missingInfo: data.missingInfo || [],
    cautions: data.cautions || [],
    rawResponse: data.rawResponse,
    createdAt: toDate(data.createdAt) || new Date(),
    createdBy: data.createdBy,
    isRegenerated: data.isRegenerated,
  };
}

/**
 * 申請のAIコメント履歴を取得
 */
export async function getApprovalCommentHistory(
  applicationId: string
): Promise<AiApprovalComment[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(AI_COMMENTS_COLLECTION)
    .where('applicationId', '==', applicationId)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      applicationId: data.applicationId,
      applicationType: data.applicationType,
      promptVersion: data.promptVersion,
      similarApprovalRate: data.similarApprovalRate,
      similarRejectionRate: data.similarRejectionRate,
      referenceCaseIds: data.referenceCaseIds || [],
      missingInfo: data.missingInfo || [],
      cautions: data.cautions || [],
      rawResponse: data.rawResponse,
      createdAt: toDate(data.createdAt) || new Date(),
      createdBy: data.createdBy,
      isRegenerated: data.isRegenerated,
    };
  });
}
