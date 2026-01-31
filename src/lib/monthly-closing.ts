// ======== 月次決算AIチェック ライブラリ ========

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  MonthlyClosingData,
  MonthlyAIReview,
  AnomalyResult,
} from '@/types/monthly-closing';
import {
  MONTHLY_AI_REVIEWS_COLLECTION,
  ANOMALY_THRESHOLDS,
} from '@/types/monthly-closing';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== データ集計 ========

/**
 * 月次決算データを集計
 */
export async function aggregateMonthlyClosingData(
  tenantId: string,
  yearMonth: string
): Promise<MonthlyClosingData> {
  const db = getAdminDb();

  // 期間を計算
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  // 前月の期間
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevYearMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  // 前年同月
  const lastYearMonth = `${year - 1}-${String(month).padStart(2, '0')}`;

  // === 支払いデータを取得 ===
  const paymentsSnapshot = await db
    .collection('payments')
    .where('tenantId', '==', tenantId)
    .where('createdAt', '>=', startDate)
    .where('createdAt', '<=', endDate)
    .get();

  const payments = paymentsSnapshot.docs.map(doc => doc.data());

  // 支払い集計
  const paymentStats = {
    approved: 0,
    completed: 0,
    pending: 0,
    failed: 0,
    count: { approved: 0, completed: 0, pending: 0, failed: 0 },
  };

  const accountItemsMap = new Map<number, {
    accountItemId: number;
    accountItemName: string;
    debitTotal: number;
    creditTotal: number;
    transactionCount: number;
  }>();

  const partnersMap = new Map<string, {
    payeeName: string;
    totalAmount: number;
    transactionCount: number;
  }>();

  for (const payment of payments) {
    const amount = payment.amount || 0;
    const status = payment.status;

    // ステータス別集計
    if (status === 'completed') {
      paymentStats.completed += amount;
      paymentStats.count.completed++;
    } else if (status === 'pending') {
      paymentStats.pending += amount;
      paymentStats.count.pending++;
    } else if (status === 'failed') {
      paymentStats.failed += amount;
      paymentStats.count.failed++;
    }
    paymentStats.approved += amount;
    paymentStats.count.approved++;

    // 取引先別集計
    const payeeName = payment.payeeName || '不明';
    if (!partnersMap.has(payeeName)) {
      partnersMap.set(payeeName, {
        payeeName,
        totalAmount: 0,
        transactionCount: 0,
      });
    }
    const partner = partnersMap.get(payeeName)!;
    partner.totalAmount += amount;
    partner.transactionCount++;
  }

  // === 申請データを取得 ===
  const applicationsSnapshot = await db
    .collection('applications')
    .where('tenantId', '==', tenantId)
    .where('createdAt', '>=', startDate)
    .where('createdAt', '<=', endDate)
    .get();

  const applicationStats = {
    submitted: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
  };

  for (const doc of applicationsSnapshot.docs) {
    const app = doc.data();
    applicationStats.submitted++;
    if (app.status === 'approved') {
      applicationStats.approved++;
    } else if (app.status === 'rejected') {
      applicationStats.rejected++;
    } else if (app.status === 'submitted') {
      applicationStats.pending++;
    }
  }

  // === 前月データを取得（比較用） ===
  const prevPaymentsSnapshot = await db
    .collection('payments')
    .where('tenantId', '==', tenantId)
    .where('createdAt', '>=', new Date(prevYear, prevMonth - 1, 1))
    .where('createdAt', '<=', new Date(prevYear, prevMonth, 0, 23, 59, 59))
    .get();

  const prevMonthTotal = prevPaymentsSnapshot.docs.reduce(
    (sum, doc) => sum + (doc.data().amount || 0),
    0
  );

  // 取引先配列に変換
  const partners = Array.from(partnersMap.values())
    .map(p => ({
      ...p,
      averageAmount: p.transactionCount > 0 ? p.totalAmount / p.transactionCount : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // 勘定科目配列に変換
  const accountItems = Array.from(accountItemsMap.values())
    .map(a => ({
      ...a,
      balance: a.debitTotal - a.creditTotal,
    }))
    .sort((a, b) => b.balance - a.balance);

  return {
    tenantId,
    yearMonth,
    revenue: {
      total: 0, // 収入は別途実装
      breakdown: [],
      previousMonth: undefined,
      previousYear: undefined,
    },
    expenses: {
      total: paymentStats.completed,
      breakdown: [],
      previousMonth: prevMonthTotal,
      previousYear: undefined,
    },
    payments: paymentStats,
    applications: applicationStats,
    accountItems,
    partners,
    aggregatedAt: new Date(),
  };
}

// ======== ルールベース異常検知 ========

/**
 * 異常を検知
 */
export function detectAnomalies(data: MonthlyClosingData): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];

  // 1. 前月比変動チェック（支出）
  if (data.expenses.previousMonth && data.expenses.previousMonth > 0) {
    const changeRate = ((data.expenses.total - data.expenses.previousMonth) / data.expenses.previousMonth) * 100;

    if (Math.abs(changeRate) >= ANOMALY_THRESHOLDS.EXPENSE_CHANGE_CRITICAL) {
      anomalies.push({
        ruleId: 'expense_mom_critical',
        ruleName: '支出の大幅変動（前月比）',
        severity: 'critical',
        category: 'trend',
        message: `支出が前月比${changeRate > 0 ? '+' : ''}${changeRate.toFixed(1)}%変動しています`,
        details: {
          expected: data.expenses.previousMonth,
          actual: data.expenses.total,
          percentage: changeRate,
        },
      });
    } else if (Math.abs(changeRate) >= ANOMALY_THRESHOLDS.EXPENSE_CHANGE_WARNING) {
      anomalies.push({
        ruleId: 'expense_mom_warning',
        ruleName: '支出の変動（前月比）',
        severity: 'warning',
        category: 'trend',
        message: `支出が前月比${changeRate > 0 ? '+' : ''}${changeRate.toFixed(1)}%変動しています`,
        details: {
          expected: data.expenses.previousMonth,
          actual: data.expenses.total,
          percentage: changeRate,
        },
      });
    }
  }

  // 2. 未払い比率チェック
  if (data.payments.approved > 0) {
    const unpaidRatio = (data.payments.pending / data.payments.approved) * 100;

    if (unpaidRatio >= ANOMALY_THRESHOLDS.UNPAID_RATIO_CRITICAL) {
      anomalies.push({
        ruleId: 'unpaid_ratio_critical',
        ruleName: '未払い比率が高い',
        severity: 'critical',
        category: 'balance',
        message: `承認済み支払いの${unpaidRatio.toFixed(1)}%が未払いです`,
        details: {
          actual: data.payments.pending,
          percentage: unpaidRatio,
        },
      });
    } else if (unpaidRatio >= ANOMALY_THRESHOLDS.UNPAID_RATIO_WARNING) {
      anomalies.push({
        ruleId: 'unpaid_ratio_warning',
        ruleName: '未払い比率',
        severity: 'warning',
        category: 'balance',
        message: `承認済み支払いの${unpaidRatio.toFixed(1)}%が未払いです`,
        details: {
          actual: data.payments.pending,
          percentage: unpaidRatio,
        },
      });
    }
  }

  // 3. 失敗支払い比率チェック
  if (data.payments.count.approved > 0) {
    const failedRatio = (data.payments.count.failed / data.payments.count.approved) * 100;

    if (failedRatio >= ANOMALY_THRESHOLDS.FAILED_RATIO_CRITICAL) {
      anomalies.push({
        ruleId: 'failed_ratio_critical',
        ruleName: '支払い失敗率が高い',
        severity: 'critical',
        category: 'compliance',
        message: `支払いの${failedRatio.toFixed(1)}%が失敗しています`,
        details: {
          actual: data.payments.count.failed,
          percentage: failedRatio,
        },
      });
    } else if (failedRatio >= ANOMALY_THRESHOLDS.FAILED_RATIO_WARNING) {
      anomalies.push({
        ruleId: 'failed_ratio_warning',
        ruleName: '支払い失敗率',
        severity: 'warning',
        category: 'compliance',
        message: `支払いの${failedRatio.toFixed(1)}%が失敗しています`,
        details: {
          actual: data.payments.count.failed,
          percentage: failedRatio,
        },
      });
    }
  }

  // 4. 取引先集中度チェック
  if (data.partners.length > 0 && data.expenses.total > 0) {
    const topPartner = data.partners[0];
    const concentration = (topPartner.totalAmount / data.expenses.total) * 100;

    if (concentration >= ANOMALY_THRESHOLDS.PARTNER_CONCENTRATION_CRITICAL) {
      anomalies.push({
        ruleId: 'partner_concentration_critical',
        ruleName: '取引先への集中',
        severity: 'critical',
        category: 'ratio',
        message: `「${topPartner.payeeName}」への支払いが全体の${concentration.toFixed(1)}%を占めています`,
        details: {
          actual: topPartner.totalAmount,
          percentage: concentration,
        },
      });
    } else if (concentration >= ANOMALY_THRESHOLDS.PARTNER_CONCENTRATION_WARNING) {
      anomalies.push({
        ruleId: 'partner_concentration_warning',
        ruleName: '取引先への集中傾向',
        severity: 'warning',
        category: 'ratio',
        message: `「${topPartner.payeeName}」への支払いが全体の${concentration.toFixed(1)}%を占めています`,
        details: {
          actual: topPartner.totalAmount,
          percentage: concentration,
        },
      });
    }
  }

  // 5. 申請滞留チェック
  if (data.applications.submitted > 0) {
    const pendingRatio = (data.applications.pending / data.applications.submitted) * 100;

    if (pendingRatio >= 30) {
      anomalies.push({
        ruleId: 'application_pending',
        ruleName: '申請の滞留',
        severity: 'warning',
        category: 'timing',
        message: `申請の${pendingRatio.toFixed(1)}%（${data.applications.pending}件）が未処理です`,
        details: {
          actual: data.applications.pending,
          percentage: pendingRatio,
        },
      });
    }
  }

  // 6. 却下率チェック
  if (data.applications.submitted > 0) {
    const rejectedRatio = (data.applications.rejected / data.applications.submitted) * 100;

    if (rejectedRatio >= 20) {
      anomalies.push({
        ruleId: 'rejection_rate',
        ruleName: '却下率が高い',
        severity: 'info',
        category: 'compliance',
        message: `申請の${rejectedRatio.toFixed(1)}%（${data.applications.rejected}件）が却下されています`,
        details: {
          actual: data.applications.rejected,
          percentage: rejectedRatio,
        },
      });
    }
  }

  return anomalies;
}

// ======== AI分析 ========

/**
 * AI分析を実行
 */
export async function runMonthlyClosingAI(
  data: MonthlyClosingData,
  anomalies: AnomalyResult[]
): Promise<MonthlyAIReview['aiAnalysis'] | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('[MonthlyClosing] OPENAI_API_KEY未設定、AI分析スキップ');
    return null;
  }

  const systemPrompt = `あなたは経理部門のアドバイザーです。
月次決算データを分析し、経営者にわかりやすく要約してください。

以下のルールに従ってください：
1. 専門用語は避け、平易な日本語で説明する
2. 重要な数字は具体的に示す
3. リスクがある場合は明確に指摘する
4. 具体的なアクションを提案する
5. ポジティブな点も含める

注意：数値の変更や仕訳の修正は行いません。分析と提案のみです。`;

  const userPrompt = `以下の月次決算データを分析してください。

## 期間
${data.yearMonth}

## 支出サマリー
- 今月の支出総額: ¥${data.expenses.total.toLocaleString()}
- 前月の支出総額: ¥${(data.expenses.previousMonth || 0).toLocaleString()}
- 変動率: ${data.expenses.previousMonth ? ((data.expenses.total - data.expenses.previousMonth) / data.expenses.previousMonth * 100).toFixed(1) : '不明'}%

## 支払い状況
- 承認済み: ${data.payments.count.approved}件 ¥${data.payments.approved.toLocaleString()}
- 支払い完了: ${data.payments.count.completed}件 ¥${data.payments.completed.toLocaleString()}
- 未払い: ${data.payments.count.pending}件 ¥${data.payments.pending.toLocaleString()}
- 失敗: ${data.payments.count.failed}件 ¥${data.payments.failed.toLocaleString()}

## 申請状況
- 申請数: ${data.applications.submitted}件
- 承認: ${data.applications.approved}件
- 却下: ${data.applications.rejected}件
- 未処理: ${data.applications.pending}件

## 取引先上位
${data.partners.slice(0, 5).map((p, i) => `${i + 1}. ${p.payeeName}: ¥${p.totalAmount.toLocaleString()} (${p.transactionCount}件)`).join('\n')}

## 検知された異常
${anomalies.length > 0
  ? anomalies.map(a => `- [${a.severity}] ${a.message}`).join('\n')
  : '異常は検知されませんでした'}

以下のJSON形式で回答してください：
{
  "summary": "全体の要約（100文字程度）",
  "keyPoints": ["重要ポイント1", "重要ポイント2", ...],
  "concerns": ["注意点1", "注意点2", ...],
  "recommendations": ["推奨アクション1", "推奨アクション2", ...]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[MonthlyClosing] OpenAI API error:', response.status);
      return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content);
    const tokensUsed = result.usage?.total_tokens || 0;

    return {
      summary: parsed.summary || '',
      keyPoints: parsed.keyPoints || [],
      concerns: parsed.concerns || [],
      recommendations: parsed.recommendations || [],
      model: 'gpt-4o-mini',
      tokensUsed,
    };
  } catch (error) {
    console.error('[MonthlyClosing] AI分析エラー:', error);
    return null;
  }
}

// ======== 保存・取得 ========

/**
 * 月次決算AIレビューを生成して保存
 */
export async function generateMonthlyAIReview(
  tenantId: string,
  yearMonth: string
): Promise<MonthlyAIReview> {
  // データ集計
  const closingData = await aggregateMonthlyClosingData(tenantId, yearMonth);

  // 異常検知
  const anomalies = detectAnomalies(closingData);

  // AI分析
  const aiAnalysis = await runMonthlyClosingAI(closingData, anomalies);

  // レビューを作成
  const review: Omit<MonthlyAIReview, 'id'> = {
    tenantId,
    yearMonth,
    closingData,
    anomalies,
    hasAnomalies: anomalies.length > 0,
    anomalySummary: {
      critical: anomalies.filter(a => a.severity === 'critical').length,
      warning: anomalies.filter(a => a.severity === 'warning').length,
      info: anomalies.filter(a => a.severity === 'info').length,
    },
    aiAnalysis: aiAnalysis || undefined,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 保存
  const db = getAdminDb();
  const docRef = await db.collection(MONTHLY_AI_REVIEWS_COLLECTION).add(review);

  return { id: docRef.id, ...review };
}

/**
 * 月次決算AIレビューを取得（tenantId, yearMonthで検索）
 */
export async function getMonthlyAIReview(
  tenantId: string,
  yearMonth: string
): Promise<MonthlyAIReview | null> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(MONTHLY_AI_REVIEWS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('yearMonth', '==', yearMonth)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    closingData: {
      ...data.closingData,
      aggregatedAt: data.closingData.aggregatedAt?.toDate?.() || new Date(),
    },
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
    reviewedAt: data.reviewedAt?.toDate?.(),
  } as MonthlyAIReview;
}

/**
 * 月次決算AIレビューをIDで取得
 */
export async function getMonthlyAIReviewById(id: string): Promise<MonthlyAIReview | null> {
  const db = getAdminDb();
  const doc = await db.collection(MONTHLY_AI_REVIEWS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    ...data,
    closingData: {
      ...data.closingData,
      aggregatedAt: data.closingData.aggregatedAt?.toDate?.() || new Date(),
    },
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
    reviewedAt: data.reviewedAt?.toDate?.(),
  } as MonthlyAIReview;
}

/**
 * 月次決算AIレビュー一覧を取得
 */
export async function listMonthlyAIReviews(
  tenantId: string,
  limit: number = 12
): Promise<MonthlyAIReview[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(MONTHLY_AI_REVIEWS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('yearMonth', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      closingData: {
        ...data.closingData,
        aggregatedAt: data.closingData.aggregatedAt?.toDate?.() || new Date(),
      },
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
      reviewedAt: data.reviewedAt?.toDate?.(),
    } as MonthlyAIReview;
  });
}

/**
 * レビューを確認済みにする
 */
export async function acknowledgeMonthlyReview(
  reviewId: string,
  userId: string,
  userName: string,
  note?: string
): Promise<void> {
  const db = getAdminDb();

  await db.collection(MONTHLY_AI_REVIEWS_COLLECTION).doc(reviewId).update({
    status: 'acknowledged',
    reviewedBy: userId,
    reviewedByName: userName,
    reviewedAt: new Date(),
    reviewNote: note,
    updatedAt: new Date(),
  });
}
