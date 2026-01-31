// ======== キャッシュフロー予測 ライブラリ ========

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  ForecastPeriod,
  ScheduledPayment,
  DailyForecast,
  CashflowForecast,
  CashflowAIReview,
} from '@/types/cashflow-forecast';
import {
  CASHFLOW_AI_REVIEWS_COLLECTION,
  CASHFLOW_THRESHOLDS,
  DEFAULT_FORECAST_PERIOD,
} from '@/types/cashflow-forecast';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== ヘルパー ========

/**
 * 期間の日数を取得
 */
function getPeriodDays(period: ForecastPeriod): number {
  switch (period) {
    case '1week': return 7;
    case '2weeks': return 14;
    case '1month': return 30;
    case '3months': return 90;
    default: return 30;
  }
}

/**
 * 日付を YYYY-MM-DD 形式にフォーマット
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * 日付を加算
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ======== データ取得 ========

/**
 * 承認済み・未払いの支払いを取得
 */
async function getPendingPayments(tenantId: string): Promise<ScheduledPayment[]> {
  const db = getAdminDb();

  // payments コレクションから承認済み・未払いを取得
  const paymentsSnapshot = await db
    .collection('payments')
    .where('tenantId', '==', tenantId)
    .where('status', 'in', ['pending', 'approved'])
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();

  const payments: ScheduledPayment[] = [];

  for (const doc of paymentsSnapshot.docs) {
    const data = doc.data();

    // 優先度を判定（金額ベース）
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (data.amount >= 1000000) {
      priority = 'high';
    } else if (data.amount < 100000) {
      priority = 'low';
    }

    // カテゴリを推定
    let category = '一般経費';
    const title = (data.applicationTitle || '').toLowerCase();
    if (title.includes('家賃') || title.includes('賃料')) {
      category = '家賃';
    } else if (title.includes('給与') || title.includes('人件費')) {
      category = '人件費';
    } else if (title.includes('仕入') || title.includes('原価')) {
      category = '仕入';
    } else if (title.includes('税') || title.includes('社会保険')) {
      category = '税・社会保険';
    }

    payments.push({
      id: doc.id,
      applicationId: data.applicationId || '',
      applicationTitle: data.applicationTitle || '支払い',
      payeeName: data.payeeName || '不明',
      amount: data.amount || 0,
      dueDate: data.dueDate || undefined,
      approvedAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
      status: data.status === 'pending' ? 'pending_payment' : 'approved',
      priority,
      category,
    });
  }

  return payments;
}

// ======== 予測生成 ========

/**
 * キャッシュフロー予測を生成
 */
export async function generateCashflowForecast(
  tenantId: string,
  period: ForecastPeriod = DEFAULT_FORECAST_PERIOD,
  currentBalance: number = 10000000 // デフォルト1000万円
): Promise<CashflowForecast> {
  const pendingPayments = await getPendingPayments(tenantId);

  const days = getPeriodDays(period);
  const startDate = new Date();
  const endDate = addDays(startDate, days);

  // 日別予測を生成
  const dailyForecasts: DailyForecast[] = [];
  let runningBalance = currentBalance;

  // 支払いを日付別にグループ化
  const paymentsByDate = new Map<string, ScheduledPayment[]>();
  const paymentsWithoutDate: ScheduledPayment[] = [];

  for (const payment of pendingPayments) {
    if (payment.dueDate) {
      const dateStr = payment.dueDate;
      if (!paymentsByDate.has(dateStr)) {
        paymentsByDate.set(dateStr, []);
      }
      paymentsByDate.get(dateStr)!.push(payment);
    } else {
      paymentsWithoutDate.push(payment);
    }
  }

  // 日付未定の支払いを期間内に均等分散
  const dailyUnscheduled = Math.ceil(paymentsWithoutDate.length / days);
  let unscheduledIndex = 0;

  for (let i = 0; i < days; i++) {
    const currentDate = addDays(startDate, i);
    const dateStr = formatDate(currentDate);

    // この日の支払い
    const scheduledPayments = paymentsByDate.get(dateStr) || [];

    // 日付未定の支払いを割り当て
    const assignedUnscheduled: ScheduledPayment[] = [];
    for (let j = 0; j < dailyUnscheduled && unscheduledIndex < paymentsWithoutDate.length; j++) {
      assignedUnscheduled.push(paymentsWithoutDate[unscheduledIndex]);
      unscheduledIndex++;
    }

    const dayPayments = [...scheduledPayments, ...assignedUnscheduled];
    const scheduledOutflow = dayPayments.reduce((sum, p) => sum + p.amount, 0);

    // 過去傾向からの推定（簡易実装）
    const estimatedOutflow = 0; // 将来実装

    const openingBalance = runningBalance;
    const closingBalance = openingBalance - scheduledOutflow - estimatedOutflow;
    runningBalance = closingBalance;

    dailyForecasts.push({
      date: dateStr,
      dayOfWeek: currentDate.getDay(),
      outflow: {
        scheduled: scheduledOutflow,
        estimated: estimatedOutflow,
        total: scheduledOutflow + estimatedOutflow,
      },
      inflow: {
        scheduled: 0,
        estimated: 0,
        total: 0,
      },
      balance: {
        opening: openingBalance,
        closing: closingBalance,
        minimum: Math.min(openingBalance, closingBalance),
      },
      payments: dayPayments,
    });
  }

  // サマリーを計算
  const totalOutflow = dailyForecasts.reduce((sum, d) => sum + d.outflow.total, 0);
  const totalInflow = dailyForecasts.reduce((sum, d) => sum + d.inflow.total, 0);
  const minimumBalance = Math.min(...dailyForecasts.map(d => d.balance.closing));
  const minimumBalanceDate = dailyForecasts.find(d => d.balance.closing === minimumBalance)?.date || '';
  const daysWithNegativeBalance = dailyForecasts.filter(d => d.balance.closing < 0).length;

  // カテゴリ別集計
  const categoryMap = new Map<string, { amount: number; count: number }>();
  for (const payment of pendingPayments) {
    const cat = payment.category || '一般経費';
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { amount: 0, count: 0 });
    }
    const catData = categoryMap.get(cat)!;
    catData.amount += payment.amount;
    catData.count++;
  }

  // 支払い予定日別集計
  const dueDateMap = new Map<string, { amount: number; count: number }>();
  for (const payment of pendingPayments) {
    const date = payment.dueDate || '未定';
    if (!dueDateMap.has(date)) {
      dueDateMap.set(date, { amount: 0, count: 0 });
    }
    const dateData = dueDateMap.get(date)!;
    dateData.amount += payment.amount;
    dateData.count++;
  }

  return {
    tenantId,
    period,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    currentBalance,
    dailyForecasts,
    summary: {
      totalOutflow,
      totalInflow,
      netCashflow: totalInflow - totalOutflow,
      minimumBalance,
      minimumBalanceDate,
      daysWithNegativeBalance,
    },
    pendingPayments: {
      total: pendingPayments.reduce((sum, p) => sum + p.amount, 0),
      count: pendingPayments.length,
      byCategory: Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        ...data,
      })).sort((a, b) => b.amount - a.amount),
      byDueDate: Array.from(dueDateMap.entries()).map(([date, data]) => ({
        date,
        ...data,
      })).sort((a, b) => a.date.localeCompare(b.date)),
    },
    generatedAt: new Date(),
  };
}

// ======== リスク検知 ========

/**
 * リスクを検知
 */
export function detectCashflowRisks(
  forecast: CashflowForecast
): CashflowAIReview['risks'] {
  const risks: CashflowAIReview['risks'] = [];

  // 1. マイナス残高チェック
  for (const day of forecast.dailyForecasts) {
    if (day.balance.closing < 0) {
      risks.push({
        type: 'negative_balance',
        severity: 'critical',
        date: day.date,
        amount: Math.abs(day.balance.closing),
        message: `${day.date}に残高が¥${Math.abs(day.balance.closing).toLocaleString()}不足する見込みです`,
      });
    }
  }

  // 2. 残高警告チェック
  for (const day of forecast.dailyForecasts) {
    if (day.balance.closing >= 0 && day.balance.closing < CASHFLOW_THRESHOLDS.LOW_BALANCE_CRITICAL) {
      risks.push({
        type: 'low_balance',
        severity: 'critical',
        date: day.date,
        amount: day.balance.closing,
        message: `${day.date}に残高が¥${day.balance.closing.toLocaleString()}に低下する見込みです`,
      });
    } else if (day.balance.closing >= CASHFLOW_THRESHOLDS.LOW_BALANCE_CRITICAL &&
               day.balance.closing < CASHFLOW_THRESHOLDS.LOW_BALANCE_WARNING) {
      risks.push({
        type: 'low_balance',
        severity: 'warning',
        date: day.date,
        amount: day.balance.closing,
        message: `${day.date}に残高が¥${day.balance.closing.toLocaleString()}に低下する見込みです`,
      });
    }
  }

  // 3. 大型支出チェック
  for (const day of forecast.dailyForecasts) {
    if (day.outflow.total >= CASHFLOW_THRESHOLDS.LARGE_OUTFLOW_CRITICAL) {
      risks.push({
        type: 'large_outflow',
        severity: 'critical',
        date: day.date,
        amount: day.outflow.total,
        message: `${day.date}に¥${day.outflow.total.toLocaleString()}の大型支出が予定されています`,
      });
    } else if (day.outflow.total >= CASHFLOW_THRESHOLDS.LARGE_OUTFLOW_WARNING) {
      risks.push({
        type: 'large_outflow',
        severity: 'warning',
        date: day.date,
        amount: day.outflow.total,
        message: `${day.date}に¥${day.outflow.total.toLocaleString()}の支出が予定されています`,
      });
    }
  }

  // 4. 支出集中チェック
  const totalOutflow = forecast.summary.totalOutflow;
  if (totalOutflow > 0) {
    for (const day of forecast.dailyForecasts) {
      const concentration = (day.outflow.total / totalOutflow) * 100;
      if (concentration >= CASHFLOW_THRESHOLDS.CONCENTRATION_CRITICAL) {
        risks.push({
          type: 'concentration',
          severity: 'critical',
          date: day.date,
          amount: day.outflow.total,
          message: `${day.date}に期間内支出の${concentration.toFixed(1)}%が集中しています`,
        });
      } else if (concentration >= CASHFLOW_THRESHOLDS.CONCENTRATION_WARNING) {
        risks.push({
          type: 'concentration',
          severity: 'warning',
          date: day.date,
          amount: day.outflow.total,
          message: `${day.date}に期間内支出の${concentration.toFixed(1)}%が集中しています`,
        });
      }
    }
  }

  // 重複を排除（同じ日の同じタイプ）
  const uniqueRisks: CashflowAIReview['risks'] = [];
  const seen = new Set<string>();

  for (const risk of risks) {
    const key = `${risk.type}-${risk.date}-${risk.severity}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRisks.push(risk);
    }
  }

  return uniqueRisks.sort((a, b) => {
    // severity順、次にdate順
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return (a.date || '').localeCompare(b.date || '');
  });
}

// ======== AI分析 ========

/**
 * AI分析を実行
 */
export async function runCashflowAI(
  forecast: CashflowForecast,
  risks: CashflowAIReview['risks']
): Promise<CashflowAIReview['aiAnalysis'] | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('[CashflowForecast] OPENAI_API_KEY未設定、AI分析スキップ');
    return null;
  }

  const systemPrompt = `あなたは財務アドバイザーです。
キャッシュフロー予測データを分析し、経営者にわかりやすく要約してください。

以下のルールに従ってください：
1. 専門用語は避け、平易な日本語で説明する
2. 重要な日付と金額は具体的に示す
3. リスクがある場合は具体的な対策を提案する
4. 支払い優先順位の提案を含める
5. 資金繰りの改善策を提案する

注意：数値の変更や支払いの自動実行は行いません。分析と提案のみです。`;

  const highPriorityPayments = forecast.dailyForecasts
    .flatMap(d => d.payments)
    .filter(p => p.priority === 'high')
    .slice(0, 10);

  const userPrompt = `以下のキャッシュフロー予測を分析してください。

## 予測期間
${forecast.startDate} 〜 ${forecast.endDate}（${forecast.period}）

## 現在の状況
- 現在残高: ¥${forecast.currentBalance.toLocaleString()}
- 未払い総額: ¥${forecast.pendingPayments.total.toLocaleString()}（${forecast.pendingPayments.count}件）

## 予測サマリー
- 期間内支出予定: ¥${forecast.summary.totalOutflow.toLocaleString()}
- 最低残高: ¥${forecast.summary.minimumBalance.toLocaleString()}（${forecast.summary.minimumBalanceDate}）
- マイナス残高の日数: ${forecast.summary.daysWithNegativeBalance}日

## カテゴリ別支出
${forecast.pendingPayments.byCategory.map(c => `- ${c.category}: ¥${c.amount.toLocaleString()}（${c.count}件）`).join('\n')}

## 高優先度の支払い
${highPriorityPayments.map(p => `- ${p.payeeName}: ¥${p.amount.toLocaleString()}（${p.category}）`).join('\n') || 'なし'}

## 検知されたリスク
${risks.length > 0
  ? risks.slice(0, 10).map(r => `- [${r.severity}] ${r.message}`).join('\n')
  : 'リスクは検知されませんでした'}

以下のJSON形式で回答してください：
{
  "summary": "全体の要約（100文字程度）",
  "keyPoints": ["重要ポイント1", "重要ポイント2", ...],
  "concerns": ["注意点・リスク1", "注意点・リスク2", ...],
  "recommendations": ["推奨アクション1（支払い優先順位など）", "推奨アクション2", ...]
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
      console.error('[CashflowForecast] OpenAI API error:', response.status);
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
    console.error('[CashflowForecast] AI分析エラー:', error);
    return null;
  }
}

// ======== 保存・取得 ========

/**
 * キャッシュフローAIレビューを生成して保存
 */
export async function generateCashflowAIReview(
  tenantId: string,
  period: ForecastPeriod = DEFAULT_FORECAST_PERIOD,
  currentBalance?: number
): Promise<CashflowAIReview> {
  // 予測を生成
  const forecast = await generateCashflowForecast(tenantId, period, currentBalance);

  // リスク検知
  const risks = detectCashflowRisks(forecast);

  // AI分析
  const aiAnalysis = await runCashflowAI(forecast, risks);

  // レビューを作成
  const review: Omit<CashflowAIReview, 'id'> = {
    tenantId,
    period,
    startDate: forecast.startDate,
    endDate: forecast.endDate,
    forecast,
    risks,
    hasRisks: risks.length > 0,
    riskSummary: {
      critical: risks.filter(r => r.severity === 'critical').length,
      warning: risks.filter(r => r.severity === 'warning').length,
      info: risks.filter(r => r.severity === 'info').length,
    },
    aiAnalysis: aiAnalysis || undefined,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 保存
  const db = getAdminDb();
  const docRef = await db.collection(CASHFLOW_AI_REVIEWS_COLLECTION).add(review);

  return { id: docRef.id, ...review };
}

/**
 * キャッシュフローAIレビューを取得
 */
export async function getCashflowAIReview(id: string): Promise<CashflowAIReview | null> {
  const db = getAdminDb();
  const doc = await db.collection(CASHFLOW_AI_REVIEWS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    ...data,
    forecast: {
      ...data.forecast,
      generatedAt: data.forecast.generatedAt?.toDate?.() || new Date(),
    },
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
    reviewedAt: data.reviewedAt?.toDate?.(),
  } as CashflowAIReview;
}

/**
 * 最新のキャッシュフローAIレビューを取得
 */
export async function getLatestCashflowAIReview(
  tenantId: string
): Promise<CashflowAIReview | null> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(CASHFLOW_AI_REVIEWS_COLLECTION)
    .where('tenantId', '==', tenantId)
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
    forecast: {
      ...data.forecast,
      generatedAt: data.forecast.generatedAt?.toDate?.() || new Date(),
    },
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
    reviewedAt: data.reviewedAt?.toDate?.(),
  } as CashflowAIReview;
}

/**
 * キャッシュフローAIレビュー一覧を取得
 */
export async function listCashflowAIReviews(
  tenantId: string,
  limit: number = 10
): Promise<CashflowAIReview[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(CASHFLOW_AI_REVIEWS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      forecast: {
        ...data.forecast,
        generatedAt: data.forecast.generatedAt?.toDate?.() || new Date(),
      },
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
      reviewedAt: data.reviewedAt?.toDate?.(),
    } as CashflowAIReview;
  });
}

/**
 * レビューを確認済みにする
 */
export async function acknowledgeCashflowReview(
  reviewId: string,
  userId: string,
  userName: string,
  note?: string
): Promise<void> {
  const db = getAdminDb();

  await db.collection(CASHFLOW_AI_REVIEWS_COLLECTION).doc(reviewId).update({
    status: 'acknowledged',
    reviewedBy: userId,
    reviewedByName: userName,
    reviewedAt: new Date(),
    reviewNote: note,
    updatedAt: new Date(),
  });
}
