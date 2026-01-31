// ======== AI副社長・日次違和感レポート生成ロジック ========

import { getAdminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import {
  DailyKpi,
  AnomalyReport,
  KpiDiff,
  KpiMetric,
  CompareType,
  AnomalyReportInput,
  KPI_METRIC_LABELS,
  ALERT_THRESHOLDS,
} from '@/types/anomaly-report';
import { toDate } from './date';
import { BRANCHES_SEED } from '@/data/employees';

const DAILY_KPI_COLLECTION = 'dailyKpis';
const ANOMALY_REPORT_COLLECTION = 'anomalyReports';
const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== KPIデータ取得 ========

/**
 * 指定期間のKPIデータを取得
 */
export async function getDailyKpis(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<DailyKpi[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(DAILY_KPI_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      date: data.date,
      baseId: data.baseId,
      occupancyRate: data.occupancyRate || 0,
      revenue: data.revenue || 0,
      laborCost: data.laborCost || 0,
      overtimeApplicationsCount: data.overtimeApplicationsCount || 0,
      expenseApplicationsCount: data.expenseApplicationsCount || 0,
      complaintsCount: data.complaintsCount || 0,
      absencesCount: data.absencesCount || 0,
      tardiesCount: data.tardiesCount || 0,
      createdAt: toDate(data.createdAt) ?? undefined,
      updatedAt: toDate(data.updatedAt) ?? undefined,
    };
  });
}

/**
 * 日付をYYYY-MM-DD形式で取得
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * N日前の日付を取得
 */
function getDateNDaysAgo(baseDate: Date, days: number): Date {
  const result = new Date(baseDate);
  result.setDate(result.getDate() - days);
  return result;
}

// ======== 差分計算 ========

/**
 * 変化率を計算
 */
function calculateChangePct(current: number, compare: number): number {
  if (compare === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - compare) / Math.abs(compare)) * 100;
}

/**
 * KPI指標ごとの差分を計算
 */
function calculateDiffs(
  currentKpis: DailyKpi[],
  compareKpis: DailyKpi[],
  compareType: CompareType
): KpiDiff[] {
  const diffs: KpiDiff[] = [];
  const metrics: KpiMetric[] = [
    'occupancyRate',
    'revenue',
    'laborCost',
    'overtimeApplicationsCount',
    'expenseApplicationsCount',
    'complaintsCount',
    'absencesCount',
    'tardiesCount',
  ];

  // 拠点マップ
  const baseNames = new Map(BRANCHES_SEED.map((b) => [b.id, b.name]));

  // 現在のKPIを拠点ごとにグループ化
  const currentByBase = new Map<string, DailyKpi>();
  currentKpis.forEach((kpi) => {
    currentByBase.set(kpi.baseId, kpi);
  });

  // 比較対象を拠点ごとに集計（平均）
  const compareByBase = new Map<string, DailyKpi>();
  if (compareType === 'vsAllBasesAvg') {
    // 全拠点平均の場合は全体の平均を計算
    const avgKpi = calculateAverageKpi(compareKpis);
    currentByBase.forEach((_, baseId) => {
      compareByBase.set(baseId, avgKpi);
    });
  } else {
    // 拠点ごとの平均
    const kpisByBase = new Map<string, DailyKpi[]>();
    compareKpis.forEach((kpi) => {
      const list = kpisByBase.get(kpi.baseId) || [];
      list.push(kpi);
      kpisByBase.set(kpi.baseId, list);
    });

    kpisByBase.forEach((kpis, baseId) => {
      compareByBase.set(baseId, calculateAverageKpi(kpis));
    });
  }

  // 各拠点・各指標で差分を計算
  currentByBase.forEach((current, baseId) => {
    const compare = compareByBase.get(baseId);
    if (!compare) return;

    metrics.forEach((metric) => {
      const currentValue = current[metric];
      const compareValue = compare[metric];
      const changePct = calculateChangePct(currentValue, compareValue);

      // アラートレベル判定
      let alertLevel: 'normal' | 'attention' | 'warning' = 'normal';
      const absChange = Math.abs(changePct);
      if (absChange >= ALERT_THRESHOLDS.warning) {
        alertLevel = 'warning';
      } else if (absChange >= ALERT_THRESHOLDS.attention) {
        alertLevel = 'attention';
      }

      // 注意以上のみ追加
      if (alertLevel !== 'normal') {
        diffs.push({
          baseId,
          baseName: baseNames.get(baseId) || baseId,
          metric,
          metricLabel: KPI_METRIC_LABELS[metric],
          currentValue,
          compareValue,
          changePct: Math.round(changePct * 10) / 10,
          compare: compareType,
          alertLevel,
        });
      }
    });
  });

  return diffs;
}

/**
 * KPIの平均を計算
 */
function calculateAverageKpi(kpis: DailyKpi[]): DailyKpi {
  if (kpis.length === 0) {
    return {
      tenantId: DEFAULT_TENANT_ID,
      date: '',
      baseId: '',
      occupancyRate: 0,
      revenue: 0,
      laborCost: 0,
      overtimeApplicationsCount: 0,
      expenseApplicationsCount: 0,
      complaintsCount: 0,
      absencesCount: 0,
      tardiesCount: 0,
    };
  }

  const sum = kpis.reduce(
    (acc, kpi) => ({
      occupancyRate: acc.occupancyRate + kpi.occupancyRate,
      revenue: acc.revenue + kpi.revenue,
      laborCost: acc.laborCost + kpi.laborCost,
      overtimeApplicationsCount: acc.overtimeApplicationsCount + kpi.overtimeApplicationsCount,
      expenseApplicationsCount: acc.expenseApplicationsCount + kpi.expenseApplicationsCount,
      complaintsCount: acc.complaintsCount + kpi.complaintsCount,
      absencesCount: acc.absencesCount + kpi.absencesCount,
      tardiesCount: acc.tardiesCount + kpi.tardiesCount,
    }),
    {
      occupancyRate: 0,
      revenue: 0,
      laborCost: 0,
      overtimeApplicationsCount: 0,
      expenseApplicationsCount: 0,
      complaintsCount: 0,
      absencesCount: 0,
      tardiesCount: 0,
    }
  );

  const count = kpis.length;
  return {
    tenantId: kpis[0].tenantId,
    date: '',
    baseId: '',
    occupancyRate: Math.round((sum.occupancyRate / count) * 10) / 10,
    revenue: Math.round(sum.revenue / count),
    laborCost: Math.round(sum.laborCost / count),
    overtimeApplicationsCount: Math.round((sum.overtimeApplicationsCount / count) * 10) / 10,
    expenseApplicationsCount: Math.round((sum.expenseApplicationsCount / count) * 10) / 10,
    complaintsCount: Math.round((sum.complaintsCount / count) * 10) / 10,
    absencesCount: Math.round((sum.absencesCount / count) * 10) / 10,
    tardiesCount: Math.round((sum.tardiesCount / count) * 10) / 10,
  };
}

// ======== AI レポート生成 ========

/**
 * AI用のプロンプトを生成
 */
function buildAiPrompt(input: AnomalyReportInput): string {
  return `あなたはAI副社長として、毎日の経営数値を確認し「違和感」を報告します。

【重要ルール】
- 断定表現は禁止です。「〜に違いない」「〜だ」「〜である」は使わない。
- 「〜かもしれません」「〜の可能性があります」「〜が考えられます」を使う。
- 承認/否認/結論の押し付けはしない。
- 仮説は最大3つまで。
- 確認先（誰に聞くべきか）は最大3つまで。

【本日のデータ】
レポート日: ${input.date}

拠点一覧:
${input.bases.map((b) => `- ${b.baseName} (${b.baseId})`).join('\n')}

検出された異常:
${
  input.diffs.length === 0
    ? '特に異常は検出されませんでした。'
    : input.diffs
        .map(
          (d) =>
            `- ${d.baseName}: ${d.metricLabel}が${d.changePct > 0 ? '+' : ''}${d.changePct}%（${d.compare === 'vs7daysAgo' ? '7日前比' : d.compare === 'vs7dayAvg' ? '7日平均比' : '全拠点平均比'}）`
        )
        .join('\n')
}

【出力フォーマット】
以下のJSON形式で出力してください:
{
  "summary": "全体サマリー（1-2文）",
  "hypotheses": ["仮説1", "仮説2", "仮説3"],
  "checkPoints": ["確認先1", "確認先2", "確認先3"]
}

異常がない場合は:
{
  "summary": "本日は特に違和感のある変動は検出されませんでした。",
  "hypotheses": [],
  "checkPoints": []
}`;
}

/**
 * AIでレポートを生成
 */
async function generateAiReport(input: AnomalyReportInput): Promise<{
  summary: string;
  hypotheses: string[];
  checkPoints: string[];
  rawResponse: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, using fallback report');
    return {
      summary: '本日のレポートはAI APIキーが設定されていないため生成できませんでした。',
      hypotheses: [],
      checkPoints: [],
      rawResponse: '',
    };
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
          summary: parsed.summary || '',
          hypotheses: (parsed.hypotheses || []).slice(0, 3),
          checkPoints: (parsed.checkPoints || []).slice(0, 3),
          rawResponse,
        };
      } catch {
        console.error('Failed to parse AI response JSON');
      }
    }

    return {
      summary: rawResponse,
      hypotheses: [],
      checkPoints: [],
      rawResponse,
    };
  } catch (error) {
    console.error('AI API error:', error);
    return {
      summary: 'AIレポート生成中にエラーが発生しました。',
      hypotheses: [],
      checkPoints: [],
      rawResponse: String(error),
    };
  }
}

// ======== メイン処理 ========

/**
 * 日次違和感レポートを生成
 */
export async function generateDailyAnomalyReport(
  targetDate?: Date,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AnomalyReport> {
  const db = getAdminDb();

  // 対象日（デフォルトは昨日）
  const today = targetDate || new Date();
  const yesterday = getDateNDaysAgo(today, 1);
  const yesterdayStr = formatDate(yesterday);

  // 7日前
  const sevenDaysAgo = getDateNDaysAgo(yesterday, 7);
  const sevenDaysAgoStr = formatDate(sevenDaysAgo);

  // 直近7日間（昨日から8日前まで）
  const eightDaysAgo = getDateNDaysAgo(yesterday, 8);
  const eightDaysAgoStr = formatDate(eightDaysAgo);

  // KPIデータ取得
  const [currentKpis, weekKpis] = await Promise.all([
    getDailyKpis(tenantId, yesterdayStr, yesterdayStr),
    getDailyKpis(tenantId, eightDaysAgoStr, sevenDaysAgoStr),
  ]);

  // 7日前比較
  const sevenDaysAgoKpis = weekKpis.filter((k) => k.date === sevenDaysAgoStr);
  const diffs7daysAgo = calculateDiffs(currentKpis, sevenDaysAgoKpis, 'vs7daysAgo');

  // 7日平均比較
  const diffs7dayAvg = calculateDiffs(currentKpis, weekKpis, 'vs7dayAvg');

  // 全拠点平均比較
  const diffsAllBasesAvg = calculateDiffs(currentKpis, currentKpis, 'vsAllBasesAvg');

  // 全差分を統合
  const allDiffs = [...diffs7daysAgo, ...diffs7dayAvg, ...diffsAllBasesAvg];

  // 重複排除（同一拠点・同一指標で最も重要なもののみ）
  const uniqueDiffs = new Map<string, KpiDiff>();
  allDiffs.forEach((diff) => {
    const key = `${diff.baseId}-${diff.metric}`;
    const existing = uniqueDiffs.get(key);
    if (!existing || Math.abs(diff.changePct) > Math.abs(existing.changePct)) {
      uniqueDiffs.set(key, diff);
    }
  });

  const finalDiffs = Array.from(uniqueDiffs.values()).sort(
    (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)
  );

  // 全体アラートレベル判定
  const warningCount = finalDiffs.filter((d) => d.alertLevel === 'warning').length;
  const attentionCount = finalDiffs.filter((d) => d.alertLevel === 'attention').length;

  let overallLevel: 'normal' | 'attention' | 'warning' | 'priority' = 'normal';
  if (warningCount + attentionCount >= ALERT_THRESHOLDS.priorityCount) {
    overallLevel = 'priority';
  } else if (warningCount > 0) {
    overallLevel = 'warning';
  } else if (attentionCount > 0) {
    overallLevel = 'attention';
  }

  // AI入力を構築
  const bases = BRANCHES_SEED.map((b) => ({
    baseId: b.id,
    baseName: b.name,
  }));

  const aiInput: AnomalyReportInput = {
    date: yesterdayStr,
    bases,
    kpi: currentKpis,
    diffs: finalDiffs.map((d) => ({
      baseId: d.baseId,
      baseName: d.baseName,
      metric: d.metric,
      metricLabel: d.metricLabel,
      currentValue: d.currentValue,
      compareValue: d.compareValue,
      changePct: d.changePct,
      compare: d.compare,
    })),
  };

  // AIレポート生成
  const aiReport = await generateAiReport(aiInput);

  // レポートを構築
  const report: AnomalyReport = {
    tenantId,
    date: yesterdayStr,
    generatedAt: new Date(),
    overallLevel,
    diffs: finalDiffs,
    aiReport,
    createdAt: new Date(),
  };

  // Firestoreに保存
  const docRef = await db.collection(ANOMALY_REPORT_COLLECTION).add({
    ...report,
    generatedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  });

  report.id = docRef.id;

  return report;
}

/**
 * 最新のレポートを取得
 */
export async function getLatestAnomalyReport(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AnomalyReport | null> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(ANOMALY_REPORT_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    tenantId: data.tenantId,
    date: data.date,
    generatedAt: toDate(data.generatedAt) || new Date(),
    overallLevel: data.overallLevel,
    diffs: data.diffs || [],
    aiReport: data.aiReport || { summary: '', hypotheses: [], checkPoints: [] },
    createdAt: toDate(data.createdAt) ?? undefined,
  };
}

/**
 * 指定日のレポートを取得
 */
export async function getAnomalyReportByDate(
  date: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AnomalyReport | null> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(ANOMALY_REPORT_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('date', '==', date)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    tenantId: data.tenantId,
    date: data.date,
    generatedAt: toDate(data.generatedAt) || new Date(),
    overallLevel: data.overallLevel,
    diffs: data.diffs || [],
    aiReport: data.aiReport || { summary: '', hypotheses: [], checkPoints: [] },
    createdAt: toDate(data.createdAt) ?? undefined,
  };
}
