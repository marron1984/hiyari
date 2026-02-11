// ======== AI副社長・ifシミュレーション生成ロジック ========

import { getAdminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import {
  IfSimulationInput,
  IfSimulationResult,
  MonthlyKpi,
  SimulationPlan,
  RiskItem,
  MonthlyProjection,
  ScenarioType,
  SCENARIO_TYPE_LABELS,
  IF_SIMULATION_PROMPT_VERSION,
} from '@/types/if-simulation';
import { buildFeaturePrompt } from './ai-vp-persona';
import { toDate } from './date';
import { BRANCHES_SEED } from '@/data/employees';

const MONTHLY_KPI_COLLECTION = 'monthlyKpis';
const IF_SIMULATION_COLLECTION = 'ifSimulations';
const DEFAULT_TENANT_ID = 'defaultTenant';
const MIN_REQUIRED_MONTHS = 12;

// ======== 月次KPIデータ取得 ========

/**
 * 指定期間の月次KPIデータを取得
 */
export async function getMonthlyKpis(
  tenantId: string,
  baseId: string,
  startMonth: string,
  endMonth: string
): Promise<MonthlyKpi[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(MONTHLY_KPI_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('baseId', '==', baseId)
    .where('month', '>=', startMonth)
    .where('month', '<=', endMonth)
    .orderBy('month', 'asc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      month: data.month,
      baseId: data.baseId,
      occupancyRate: data.occupancyRate || 0,
      revenue: data.revenue || 0,
      laborCost: data.laborCost || 0,
      laborCostRatio: data.laborCostRatio || 0,
      operatingCost: data.operatingCost || 0,
      profit: data.profit || 0,
      profitRate: data.profitRate || 0,
      staffCount: data.staffCount || 0,
      residentCount: data.residentCount || 0,
    };
  });
}

/**
 * N ヶ月前の月を取得 (YYYY-MM)
 */
function getMonthNMonthsAgo(baseMonth: string, months: number): string {
  const [year, month] = baseMonth.split('-').map(Number);
  const date = new Date(year, month - 1 - months, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 現在の月を取得 (YYYY-MM)
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 月を加算 (YYYY-MM)
 */
function addMonths(month: string, add: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1 + add, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ======== 現状サマリー計算 ========

interface CurrentStatus {
  averageOccupancyRate: number;
  averageRevenue: number;
  averageLaborCostRatio: number;
  averageProfitRate: number;
  latestStaffCount: number;
  latestResidentCount: number;
}

function calculateCurrentStatus(kpis: MonthlyKpi[]): CurrentStatus {
  if (kpis.length === 0) {
    return {
      averageOccupancyRate: 0,
      averageRevenue: 0,
      averageLaborCostRatio: 0,
      averageProfitRate: 0,
      latestStaffCount: 0,
      latestResidentCount: 0,
    };
  }

  const sum = kpis.reduce(
    (acc, kpi) => ({
      occupancyRate: acc.occupancyRate + kpi.occupancyRate,
      revenue: acc.revenue + kpi.revenue,
      laborCostRatio: acc.laborCostRatio + kpi.laborCostRatio,
      profitRate: acc.profitRate + kpi.profitRate,
    }),
    { occupancyRate: 0, revenue: 0, laborCostRatio: 0, profitRate: 0 }
  );

  const count = kpis.length;
  const latest = kpis[kpis.length - 1];

  return {
    averageOccupancyRate: Math.round((sum.occupancyRate / count) * 10) / 10,
    averageRevenue: Math.round(sum.revenue / count),
    averageLaborCostRatio: Math.round((sum.laborCostRatio / count) * 10) / 10,
    averageProfitRate: Math.round((sum.profitRate / count) * 10) / 10,
    latestStaffCount: latest.staffCount,
    latestResidentCount: latest.residentCount,
  };
}

// ======== AI プロンプト生成 ========

function buildSimulationPrompt(
  input: IfSimulationInput,
  baseName: string,
  currentStatus: CurrentStatus,
  historicalKpis: MonthlyKpi[]
): string {
  const scenarioLabel = SCENARIO_TYPE_LABELS[input.scenarioType];
  const optionalDesc = input.optionalParams?.customDescription
    ? `\nカスタム説明: ${input.optionalParams.customDescription}`
    : '';
  const changeRate = input.optionalParams?.changeRate
    ? `\n変動率: ${input.optionalParams.changeRate}%`
    : '';
  const initialInvestment = input.optionalParams?.initialInvestment
    ? `\n初期投資額: ${input.optionalParams.initialInvestment.toLocaleString()}円`
    : '';

  const kpiSummary = historicalKpis
    .slice(-6)
    .map(
      (k) =>
        `${k.month}: 入居率${k.occupancyRate}%, 売上${(k.revenue / 10000).toFixed(0)}万円, 人件費率${k.laborCostRatio}%, 利益率${k.profitRate}%`
    )
    .join('\n');

  return `以下のシナリオについてA/B/C 3案のシミュレーションを実施してください。

【シナリオ情報】
シナリオタイプ: ${scenarioLabel}
対象拠点: ${baseName} (${input.baseId})
シミュレーション期間: ${input.period.startMonth}から${input.period.months}ヶ月間${optionalDesc}${changeRate}${initialInvestment}

【現状データ】
- 平均入居率: ${currentStatus.averageOccupancyRate}%
- 平均月間売上: ${(currentStatus.averageRevenue / 10000).toFixed(0)}万円
- 平均人件費率: ${currentStatus.averageLaborCostRatio}%
- 平均利益率: ${currentStatus.averageProfitRate}%
- 現在スタッフ数: ${currentStatus.latestStaffCount}名
- 現在入居者数: ${currentStatus.latestResidentCount}名

【過去6ヶ月のKPI推移】
${kpiSummary}

【出力フォーマット】
以下のJSON形式で出力してください。必ず3つのプランを含めること:

{
  "plans": [
    {
      "planId": "A",
      "planName": "案Aの名前（例：保守的プラン）",
      "description": "プランの概要説明",
      "assumptions": ["前提条件1", "前提条件2", "前提条件3"],
      "monthlyProjections": [
        {
          "month": "YYYY-MM",
          "occupancyRate": 85.0,
          "revenue": 5000000,
          "laborCost": 2000000,
          "laborCostRatio": 40.0,
          "profit": 500000,
          "profitRate": 10.0
        }
      ],
      "summary": {
        "totalRevenue": 60000000,
        "totalProfit": 6000000,
        "averageOccupancyRate": 85.0,
        "averageLaborCostRatio": 40.0,
        "averageProfitRate": 10.0,
        "revenueChange": 5.0,
        "profitChange": 8.0,
        "breakEvenMonth": null
      },
      "risks": [
        {
          "category": "financial",
          "description": "リスク内容",
          "impact": "high",
          "probability": "medium"
        }
      ],
      "calculations": ["計算根拠1", "計算根拠2"]
    },
    {
      "planId": "B",
      ...B案
    },
    {
      "planId": "C",
      ...C案
    }
  ]
}

注意:
- monthlyProjectionsは${input.period.months}ヶ月分を含める
- risksのcategoryは: financial, operational, regulatory, market, human_resource のいずれか
- impactとprobabilityは: high, medium, low のいずれか
- 数値は現実的な範囲で算出すること`;
}

// ======== AI レスポンスパース ========

interface AiSimulationResponse {
  plans: Array<{
    planId: 'A' | 'B' | 'C';
    planName: string;
    description: string;
    assumptions: string[];
    monthlyProjections: MonthlyProjection[];
    summary: {
      totalRevenue: number;
      totalProfit: number;
      averageOccupancyRate: number;
      averageLaborCostRatio: number;
      averageProfitRate: number;
      revenueChange: number;
      profitChange: number;
      breakEvenMonth?: number | null;
    };
    risks: RiskItem[];
    calculations: string[];
  }>;
}

function parseAiResponse(rawResponse: string): AiSimulationResponse | null {
  // コードブロック対応
  const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : rawResponse;
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.plans || !Array.isArray(parsed.plans) || parsed.plans.length !== 3) {
      console.error('Invalid plans structure');
      return null;
    }
    return parsed as AiSimulationResponse;
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    return null;
  }
}

// ======== フォールバックプラン生成 ========

function generateFallbackPlans(
  input: IfSimulationInput,
  currentStatus: CurrentStatus
): [SimulationPlan, SimulationPlan, SimulationPlan] {
  const months = input.period.months;
  const startMonth = input.period.startMonth;

  const createPlan = (
    planId: 'A' | 'B' | 'C',
    planName: string,
    multiplier: number
  ): SimulationPlan => {
    const projections: MonthlyProjection[] = [];
    for (let i = 0; i < months; i++) {
      const month = addMonths(startMonth, i);
      projections.push({
        month,
        occupancyRate: currentStatus.averageOccupancyRate * multiplier,
        revenue: Math.round(currentStatus.averageRevenue * multiplier),
        laborCost: Math.round(currentStatus.averageRevenue * (currentStatus.averageLaborCostRatio / 100)),
        laborCostRatio: currentStatus.averageLaborCostRatio,
        profit: Math.round(currentStatus.averageRevenue * (currentStatus.averageProfitRate / 100) * multiplier),
        profitRate: currentStatus.averageProfitRate * multiplier,
      });
    }

    const totalRevenue = projections.reduce((sum, p) => sum + p.revenue, 0);
    const totalProfit = projections.reduce((sum, p) => sum + p.profit, 0);

    return {
      planId,
      planName,
      description: 'AIレポート生成中にエラーが発生したため、簡易予測を表示しています。',
      assumptions: ['過去実績に基づく簡易計算'],
      monthlyProjections: projections,
      summary: {
        totalRevenue,
        totalProfit,
        averageOccupancyRate: currentStatus.averageOccupancyRate * multiplier,
        averageLaborCostRatio: currentStatus.averageLaborCostRatio,
        averageProfitRate: currentStatus.averageProfitRate * multiplier,
        revenueChange: (multiplier - 1) * 100,
        profitChange: (multiplier - 1) * 100,
      },
      risks: [
        {
          category: 'operational',
          description: '簡易予測のため詳細リスク分析は未実施',
          impact: 'medium',
          probability: 'medium',
        },
      ],
      calculations: ['過去平均 × 係数による簡易計算'],
    };
  };

  return [
    createPlan('A', '現状維持プラン', 1.0),
    createPlan('B', '成長プラン', 1.05),
    createPlan('C', '積極成長プラン', 1.10),
  ];
}

// ======== メイン処理 ========

/**
 * ifシミュレーションを生成
 */
export async function generateIfSimulation(
  input: IfSimulationInput,
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<IfSimulationResult> {
  const db = getAdminDb();

  // 拠点名を取得
  const base = BRANCHES_SEED.find((b) => b.id === input.baseId);
  const baseName = base?.name || input.baseId;

  // 過去12ヶ月以上のKPIを取得
  const currentMonth = getCurrentMonth();
  const startMonth = getMonthNMonthsAgo(currentMonth, MIN_REQUIRED_MONTHS);

  const historicalKpis = await getMonthlyKpis(
    tenantId,
    input.baseId,
    startMonth,
    currentMonth
  );

  // 現状サマリーを計算
  const currentStatus = calculateCurrentStatus(historicalKpis);

  // 参照期間
  const referenceKpiPeriod = {
    from: historicalKpis.length > 0 ? historicalKpis[0].month : startMonth,
    to: historicalKpis.length > 0 ? historicalKpis[historicalKpis.length - 1].month : currentMonth,
    months: historicalKpis.length,
  };

  // AIでシミュレーション生成
  let plans: [SimulationPlan, SimulationPlan, SimulationPlan];

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, using fallback plans');
    plans = generateFallbackPlans(input, currentStatus);
  } else {
    try {
      const client = new Anthropic({ apiKey });
      const prompt = buildSimulationPrompt(input, baseName, currentStatus, historicalKpis);

      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: buildFeaturePrompt('if_simulation'),
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const rawResponse =
        message.content[0].type === 'text' ? message.content[0].text : '';

      const parsed = parseAiResponse(rawResponse);

      if (parsed && parsed.plans.length === 3) {
        plans = parsed.plans.map((p) => ({
          planId: p.planId,
          planName: p.planName,
          description: p.description,
          assumptions: p.assumptions || [],
          monthlyProjections: p.monthlyProjections || [],
          summary: {
            totalRevenue: p.summary?.totalRevenue || 0,
            totalProfit: p.summary?.totalProfit || 0,
            averageOccupancyRate: p.summary?.averageOccupancyRate || 0,
            averageLaborCostRatio: p.summary?.averageLaborCostRatio || 0,
            averageProfitRate: p.summary?.averageProfitRate || 0,
            revenueChange: p.summary?.revenueChange || 0,
            profitChange: p.summary?.profitChange || 0,
            breakEvenMonth: p.summary?.breakEvenMonth ?? undefined,
          },
          risks: p.risks || [],
          calculations: p.calculations || [],
        })) as [SimulationPlan, SimulationPlan, SimulationPlan];
      } else {
        console.error('Failed to parse AI response, using fallback');
        plans = generateFallbackPlans(input, currentStatus);
      }
    } catch (error) {
      console.error('AI API error:', error);
      plans = generateFallbackPlans(input, currentStatus);
    }
  }

  // 結果を構築
  const result: IfSimulationResult = {
    id: '',
    createdAt: new Date(),
    createdBy: userId,
    input,
    baseName,
    referenceKpiPeriod,
    currentStatus,
    plans,
    aiModel: 'claude-sonnet-4-20250514',
    promptVersion: IF_SIMULATION_PROMPT_VERSION,
  };

  // Firestoreに保存
  const docRef = await db.collection(IF_SIMULATION_COLLECTION).add({
    ...result,
    createdAt: Timestamp.now(),
  });

  result.id = docRef.id;

  return result;
}

/**
 * シミュレーション履歴を取得
 */
export async function getSimulationHistory(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  limit: number = 10
): Promise<IfSimulationResult[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(IF_SIMULATION_COLLECTION)
    .where('createdBy', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      createdAt: toDate(data.createdAt) || new Date(),
      createdBy: data.createdBy,
      input: data.input,
      baseName: data.baseName,
      referenceKpiPeriod: data.referenceKpiPeriod,
      currentStatus: data.currentStatus,
      plans: data.plans,
      aiModel: data.aiModel,
      promptVersion: data.promptVersion,
    };
  });
}

/**
 * シミュレーションをIDで取得
 */
export async function getSimulationById(
  id: string
): Promise<IfSimulationResult | null> {
  const db = getAdminDb();

  const doc = await db.collection(IF_SIMULATION_COLLECTION).doc(id).get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    id: doc.id,
    createdAt: toDate(data.createdAt) || new Date(),
    createdBy: data.createdBy,
    input: data.input,
    baseName: data.baseName,
    referenceKpiPeriod: data.referenceKpiPeriod,
    currentStatus: data.currentStatus,
    plans: data.plans,
    aiModel: data.aiModel,
    promptVersion: data.promptVersion,
  };
}
