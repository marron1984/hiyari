// ======== 勘定科目AIレビュー ライブラリ ========

import { getAdminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type {
  AccountingAIReview,
  AnomalyFlags,
  AICheckInput,
  AICheckResult,
  AIAlternative,
} from '@/types/accounting-ai-review';
import {
  ACCOUNTING_AI_REVIEWS_COLLECTION,
  AMOUNT_OUTLIER_THRESHOLD,
  HISTORICAL_TRANSACTION_DAYS,
} from '@/types/accounting-ai-review';
import type { AccountItem } from '@/types/accounting-template';
import { COMMON_ACCOUNT_ITEMS } from '@/types/accounting-template';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== ヘルパー ========

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
}

function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

// ======== 異常フラグ算出 ========

/**
 * 異常フラグを算出
 */
export async function calculateAnomalyFlags(input: AICheckInput): Promise<AnomalyFlags> {
  const flags: AnomalyFlags = {
    accountItemChanged: false,
    amountOutlier: false,
    taxCodeMismatch: false,
    paymentMethodMismatch: false,
  };

  const history = input.historicalTransactions || [];

  // 1. 勘定科目変更チェック
  if (history.length > 0) {
    const mostUsedAccountId = getMostFrequentAccountItem(history);
    if (mostUsedAccountId && mostUsedAccountId !== input.template.accountItem.accountItemId) {
      flags.accountItemChanged = true;
      const prevAccountName = COMMON_ACCOUNT_ITEMS.find(a => a.accountItemId === mostUsedAccountId)?.accountItemName || '不明';
      flags.accountItemChangedReason =
        `過去の取引では「${prevAccountName}」を使用していましたが、今回は「${input.template.accountItem.accountItemName}」が選択されています`;
    }
  }

  // 2. 金額外れ値チェック
  if (history.length >= 3) {
    const amounts = history.map(h => h.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.map(a => Math.pow(a - mean, 2)).reduce((a, b) => a + b, 0) / amounts.length);

    if (stdDev > 0) {
      const zScore = Math.abs(input.amount - mean) / stdDev;
      if (zScore > AMOUNT_OUTLIER_THRESHOLD) {
        flags.amountOutlier = true;
        const avgFormatted = Math.round(mean).toLocaleString();
        flags.amountOutlierReason =
          `同一取引先の平均金額は${avgFormatted}円ですが、今回は${input.amount.toLocaleString()}円と${zScore > 3 ? '大幅に' : ''}異なります`;
      }
    }
  }

  // 3. 税区分不一致チェック（簡易版）
  // 通常、経費は課税仕入10%（コード5）だが、非課税の場合は警告
  if (input.template.taxCode) {
    const nonTaxableCodes = [3, 4, 7, 8]; // 非課税・不課税系
    const isTaxable = !nonTaxableCodes.includes(input.template.taxCode);

    // 取引先名に特定キーワードがある場合の不整合チェック
    const payeeLower = input.payeeName.toLowerCase();
    if (isTaxable && (payeeLower.includes('保険') || payeeLower.includes('行政'))) {
      flags.taxCodeMismatch = true;
      flags.taxCodeMismatchReason = '保険・行政関連の支払いは非課税の可能性があります';
    }
  }

  // 4. 支払種別不整合チェック
  if (history.length > 0 && input.paymentMethod) {
    // 過去が全て銀行振込なのに今回がクレジットカード等
    // （簡易実装：支払方法の履歴がないため、取引先名ベースでチェック）
    const payeeLower = input.payeeName.toLowerCase();
    if (input.paymentMethod === 'credit_card' &&
        (payeeLower.includes('銀行') || payeeLower.includes('バンク'))) {
      flags.paymentMethodMismatch = true;
      flags.paymentMethodMismatchReason = '銀行への支払いにクレジットカードが選択されています';
    }
  }

  return flags;
}

/**
 * 過去取引で最も使用された勘定科目IDを取得
 */
function getMostFrequentAccountItem(
  history: Array<{ accountItemId: number }>
): number | null {
  if (history.length === 0) return null;

  const counts: Record<number, number> = {};
  for (const h of history) {
    counts[h.accountItemId] = (counts[h.accountItemId] || 0) + 1;
  }

  let maxCount = 0;
  let maxId: number | null = null;
  for (const [id, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxId = parseInt(id);
    }
  }

  return maxId;
}

// ======== AI分析 ========

/**
 * AI分析を実行（異常時のみ）
 */
export async function runAIAnalysis(
  input: AICheckInput,
  flags: AnomalyFlags
): Promise<{
  reason: string;
  alternatives: AIAlternative[];
  suggestedAction: 'proceed' | 'review' | 'change';
} | null> {
  // OpenAI APIキーがない場合はスキップ
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('[AccountingAI] OpenAI APIキーが設定されていないためスキップ');
    return null;
  }

  try {
    // 構造化データを作成
    const analysisInput = {
      payment: {
        payee: input.payeeName,
        amount: input.amount,
        method: input.paymentMethod,
        purpose: input.purpose || '',
        description: input.description || '',
      },
      selectedAccount: {
        id: input.template.accountItem.accountItemId,
        name: input.template.accountItem.accountItemName,
      },
      anomalies: Object.entries(flags)
        .filter(([key, value]) => value === true && !key.endsWith('Reason'))
        .map(([key]) => {
          const reasonKey = `${key}Reason` as keyof AnomalyFlags;
          return {
            type: key,
            reason: flags[reasonKey] || '',
          };
        }),
      history: input.historicalTransactions?.slice(0, 5).map(h => ({
        amount: h.amount,
        account: h.accountItemName,
      })) || [],
    };

    const prompt = `あなたは経理の専門家です。以下の支払い情報と検出された違和感について分析してください。

## 支払い情報
- 取引先: ${analysisInput.payment.payee}
- 金額: ${analysisInput.payment.amount.toLocaleString()}円
- 支払方法: ${analysisInput.payment.method}
- 目的: ${analysisInput.payment.purpose}
- 選択された勘定科目: ${analysisInput.selectedAccount.name}

## 検出された違和感
${analysisInput.anomalies.map(a => `- ${a.reason}`).join('\n')}

## 過去の取引履歴（同一取引先）
${analysisInput.history.length > 0 ? analysisInput.history.map(h => `- ${h.amount.toLocaleString()}円 → ${h.account}`).join('\n') : 'なし'}

以下のJSON形式で回答してください:
{
  "reason": "違和感の理由を1-2文で説明",
  "alternatives": [
    {"accountName": "代替の勘定科目名", "reason": "この科目が適切な理由", "confidence": 0-100}
  ],
  "suggestedAction": "proceed（このまま進める）/ review（要確認）/ change（変更推奨）"
}`;

    console.log('[AccountingAI] AI分析開始');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '経理の専門家として、勘定科目の妥当性を分析してください。回答は必ずJSON形式で。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // JSONを抽出してパース
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 代替案を AccountItem 形式に変換
    const alternatives: AIAlternative[] = (parsed.alternatives || [])
      .slice(0, 2)
      .map((alt: { accountName: string; reason: string; confidence: number }) => {
        const accountItem = COMMON_ACCOUNT_ITEMS.find(
          a => a.accountItemName === alt.accountName || a.accountItemName.includes(alt.accountName)
        ) || { accountItemId: 0, accountItemName: alt.accountName };

        return {
          accountItem,
          reason: alt.reason,
          confidence: alt.confidence || 50,
        };
      });

    console.log('[AccountingAI] AI分析完了', {
      reason: parsed.reason,
      alternativesCount: alternatives.length,
      suggestedAction: parsed.suggestedAction,
    });

    return {
      reason: parsed.reason || '分析結果なし',
      alternatives,
      suggestedAction: parsed.suggestedAction || 'review',
    };
  } catch (error) {
    console.error('[AccountingAI] AI分析エラー:', error);
    return null;
  }
}

// ======== AIチェック実行 ========

/**
 * AIチェックを実行
 */
export async function performAICheck(input: AICheckInput): Promise<AICheckResult> {
  try {
    // 1. 異常フラグを算出
    const flags = await calculateAnomalyFlags(input);

    // 2. 異常があるかチェック
    const hasAnomaly =
      flags.accountItemChanged ||
      flags.amountOutlier ||
      flags.taxCodeMismatch ||
      flags.paymentMethodMismatch;

    // 3. 異常がない場合はAIを呼ばない
    if (!hasAnomaly) {
      console.log('[AccountingAI] 異常なし、AI分析スキップ');
      return {
        success: true,
        anomalyFlags: flags,
        hasAnomaly: false,
      };
    }

    console.log('[AccountingAI] 異常検出、AI分析実行', { flags });

    // 4. AI分析を実行
    const aiAnalysis = await runAIAnalysis(input, flags);

    // 5. 結果を保存
    await saveAIReview(input, flags, aiAnalysis);

    return {
      success: true,
      anomalyFlags: flags,
      hasAnomaly: true,
      aiAnalysis: aiAnalysis || undefined,
    };
  } catch (error) {
    console.error('[AccountingAI] チェックエラー:', error);
    return {
      success: false,
      anomalyFlags: {
        accountItemChanged: false,
        amountOutlier: false,
        taxCodeMismatch: false,
        paymentMethodMismatch: false,
      },
      hasAnomaly: false,
      error: error instanceof Error ? error.message : 'チェックに失敗しました',
    };
  }
}

// ======== レビュー保存 ========

/**
 * AIレビュー結果を保存
 */
async function saveAIReview(
  input: AICheckInput,
  flags: AnomalyFlags,
  aiAnalysis: Awaited<ReturnType<typeof runAIAnalysis>>
): Promise<string> {
  const db = getAdminDb();

  const data = removeUndefined({
    tenantId: DEFAULT_TENANT_ID,
    paymentId: input.paymentId,
    applicationId: input.applicationId,
    templateId: input.template.id,
    templateName: input.template.name,
    matchedAccountItem: input.template.accountItem,
    anomalyFlags: flags,
    hasAnomaly: true,
    aiAnalysis: aiAnalysis || undefined,
    aiCalled: !!aiAnalysis,
    aiModel: aiAnalysis ? 'gpt-4o-mini' : undefined,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const docRef = await db.collection(ACCOUNTING_AI_REVIEWS_COLLECTION).add(data);
  console.log('[AccountingAI] レビュー保存:', docRef.id);
  return docRef.id;
}

// ======== レビュー取得 ========

/**
 * 支払いIDでレビューを取得
 */
export async function getAIReviewByPaymentId(paymentId: string): Promise<AccountingAIReview | null> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(ACCOUNTING_AI_REVIEWS_COLLECTION)
    .where('paymentId', '==', paymentId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    tenantId: data.tenantId,
    paymentId: data.paymentId,
    applicationId: data.applicationId,
    templateId: data.templateId,
    templateName: data.templateName,
    matchedAccountItem: data.matchedAccountItem,
    anomalyFlags: data.anomalyFlags,
    hasAnomaly: data.hasAnomaly,
    aiAnalysis: data.aiAnalysis,
    aiCalled: data.aiCalled,
    aiModel: data.aiModel,
    aiTokensUsed: data.aiTokensUsed,
    aiError: data.aiError,
    reviewerDecision: data.reviewerDecision,
    reviewerSelectedAccountItemId: data.reviewerSelectedAccountItemId,
    reviewerNote: data.reviewerNote,
    reviewedBy: data.reviewedBy,
    reviewedByName: data.reviewedByName,
    reviewedAt: toDate(data.reviewedAt),
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  };
}

/**
 * 申請IDでレビューを取得
 */
export async function getAIReviewByApplicationId(applicationId: string): Promise<AccountingAIReview | null> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(ACCOUNTING_AI_REVIEWS_COLLECTION)
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
    paymentId: data.paymentId,
    applicationId: data.applicationId,
    templateId: data.templateId,
    templateName: data.templateName,
    matchedAccountItem: data.matchedAccountItem,
    anomalyFlags: data.anomalyFlags,
    hasAnomaly: data.hasAnomaly,
    aiAnalysis: data.aiAnalysis,
    aiCalled: data.aiCalled,
    aiModel: data.aiModel,
    aiTokensUsed: data.aiTokensUsed,
    aiError: data.aiError,
    reviewerDecision: data.reviewerDecision,
    reviewerSelectedAccountItemId: data.reviewerSelectedAccountItemId,
    reviewerNote: data.reviewerNote,
    reviewedBy: data.reviewedBy,
    reviewedByName: data.reviewedByName,
    reviewedAt: toDate(data.reviewedAt),
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  };
}

/**
 * 承認者の判断を記録
 */
export async function recordReviewerDecision(
  reviewId: string,
  decision: 'accepted' | 'changed' | 'ignored',
  reviewerId: string,
  reviewerName: string,
  options?: {
    selectedAccountItemId?: number;
    note?: string;
  }
): Promise<void> {
  const db = getAdminDb();

  const data = removeUndefined({
    reviewerDecision: decision,
    reviewerSelectedAccountItemId: options?.selectedAccountItemId,
    reviewerNote: options?.note,
    reviewedBy: reviewerId,
    reviewedByName: reviewerName,
    reviewedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection(ACCOUNTING_AI_REVIEWS_COLLECTION).doc(reviewId).update(data);
}
