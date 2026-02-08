/**
 * leadScore 重み自動提案エンジン
 *
 * Ticket 124: ルールベースでAI VP settings (062/063) への改善提案を生成
 *
 * 処理フロー:
 * 1. sales_next_action チケット（closed、直近N日）を集計
 * 2. resultCode 分布・ステージ進展率・ref別成功率を算出
 * 3. ルールベースで設定変更提案を生成
 * 4. 提案をストアに保存
 */

import { listTickets } from '@/lib/tickets/repo';
import type { Ticket, TicketMeta, ViewerContext, SalesTaskResultCode } from '@/lib/tickets/types';
import { getAiVpConfig } from '@/lib/aiVp/settings';
import type { AiVpConfig, AiVpWeights } from '@/lib/aiVp/defaultConfig';
import type {
  SalesMetricsAggregation,
  ResultCodeDistribution,
  StageProgressionRate,
  RefSuccessRate,
  BusinessUnitSuccessRate,
  LeadScoreSuggestionItem,
  LeadScoreSuggestion,
  SuggestionConfidence,
} from './types';
import {
  getSuggestions,
  saveSuggestion,
} from './suggestionsRepo';

// ======== 定数 ========

/** 進展とみなされる結果コード */
const PROGRESSION_CODES: SalesTaskResultCode[] = ['tour_scheduled', 'applied', 'accepted'];

/** 成功とみなされる結果コード */
const SUCCESS_CODES: SalesTaskResultCode[] = ['accepted'];

/** metaJson（またはレガシー meta）を安全に取得 */
function getMeta(t: Ticket): TicketMeta | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t.metaJson ?? (t as any).meta ?? null;
}

/** 最低サンプル数（これ未満の場合は提案を生成しない） */
const MIN_SAMPLE_SIZE = 5;

// ======== 集計 ========

/**
 * sales_next_action チケットを集計
 */
export function aggregateMetrics(
  tickets: Ticket[],
  rangeDays: number
): SalesMetricsAggregation {
  // sales_next_action のみ
  const salesTickets = tickets.filter(
    (t) => t.relatedType === 'sales_next_action' && t.status === 'closed' && getMeta(t)?.resultCode
  );

  // 期間フィルタ
  const cutoff = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const filtered = salesTickets.filter((t) => new Date(t.closedAt || t.updatedAt) >= cutoff);

  // resultCode 分布
  const codeCounts = new Map<SalesTaskResultCode, number>();
  for (const t of filtered) {
    const code = getMeta(t)!.resultCode!;
    codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  }

  const resultDistribution: ResultCodeDistribution[] = Array.from(codeCounts.entries()).map(
    ([code, count]) => ({
      code,
      count,
      percentage: filtered.length > 0 ? Math.round((count / filtered.length) * 100) : 0,
    })
  );

  // ステージ進展率
  const stageMap = new Map<string, { total: number; progressed: number }>();
  for (const t of filtered) {
    const stage = t.stage || 'unknown';
    const entry = stageMap.get(stage) || { total: 0, progressed: 0 };
    entry.total++;
    if (PROGRESSION_CODES.includes(getMeta(t)!.resultCode!)) {
      entry.progressed++;
    }
    stageMap.set(stage, entry);
  }

  const stageProgression: StageProgressionRate[] = Array.from(stageMap.entries()).map(
    ([stage, { total, progressed }]) => ({
      stage,
      total,
      progressed,
      rate: total > 0 ? Math.round((progressed / total) * 100) : 0,
    })
  );

  // ref別成功率
  const refMap = new Map<string, { total: number; accepted: number }>();
  for (const t of filtered) {
    const ref = getMeta(t)?.ref || 'unknown';
    const entry = refMap.get(ref) || { total: 0, accepted: 0 };
    entry.total++;
    if (SUCCESS_CODES.includes(getMeta(t)!.resultCode!)) {
      entry.accepted++;
    }
    refMap.set(ref, entry);
  }

  const refSuccessRates: RefSuccessRate[] = Array.from(refMap.entries()).map(
    ([ref, { total, accepted }]) => ({
      ref,
      total,
      accepted,
      rate: total > 0 ? Math.round((accepted / total) * 100) : 0,
    })
  );

  // businessUnit別成功率
  const buMap = new Map<string, { total: number; accepted: number }>();
  for (const t of filtered) {
    const buId = t.businessUnitId || 'unknown';
    const entry = buMap.get(buId) || { total: 0, accepted: 0 };
    entry.total++;
    if (SUCCESS_CODES.includes(getMeta(t)!.resultCode!)) {
      entry.accepted++;
    }
    buMap.set(buId, entry);
  }

  const businessUnitSuccessRates: BusinessUnitSuccessRate[] = Array.from(buMap.entries()).map(
    ([businessUnitId, { total, accepted }]) => ({
      businessUnitId,
      total,
      accepted,
      rate: total > 0 ? Math.round((accepted / total) * 100) : 0,
    })
  );

  // SLA超過
  const slaBreachCount = filtered.filter((t) => {
    if (!t.dueAt) return false;
    const closedDate = new Date(t.closedAt || t.updatedAt);
    return closedDate > new Date(t.dueAt);
  }).length;

  return {
    rangeDays,
    totalTickets: filtered.length,
    resultDistribution,
    stageProgression,
    refSuccessRates,
    businessUnitSuccessRates,
    slaBreachCount,
    slaBreachRate: filtered.length > 0 ? Math.round((slaBreachCount / filtered.length) * 100) : 0,
  };
}

// ======== ルールベース提案 ========

function confidence(sampleSize: number): SuggestionConfidence {
  if (sampleSize >= 30) return 'high';
  if (sampleSize >= 15) return 'medium';
  return 'low';
}

/**
 * ルールA: SLA超過が多い → tickets_urgent / tickets_overdue を上げる
 */
function ruleSlaBreachHigh(
  metrics: SalesMetricsAggregation,
  _currentConfig: AiVpConfig
): LeadScoreSuggestionItem | null {
  if (metrics.totalTickets < MIN_SAMPLE_SIZE) return null;
  if (metrics.slaBreachRate < 30) return null; // 30%以上で発動

  const delta = metrics.slaBreachRate >= 50 ? 3 : 2;

  return {
    key: 'sla_breach_high',
    title: 'SLA超過率が高い: チケット緊急度の重みを強化',
    rationale: `直近${metrics.rangeDays}日間のSLA超過率が${metrics.slaBreachRate}%です。緊急チケット・期限超過チケットの重みを+${delta}して、早期対応を促進する提案です。`,
    suggestedConfigPatch: {
      weights: {
        tickets_urgent: delta,
        tickets_overdue: delta,
      } as AiVpWeights,
    },
    confidence: confidence(metrics.totalTickets),
  };
}

/**
 * ルールB: tour_scheduled に進まない → alerts_warning を上げる
 */
function ruleLowTourConversion(
  metrics: SalesMetricsAggregation,
  _currentConfig: AiVpConfig
): LeadScoreSuggestionItem | null {
  if (metrics.totalTickets < MIN_SAMPLE_SIZE) return null;

  const tourScheduled = metrics.resultDistribution.find((d) => d.code === 'tour_scheduled');
  const tourRate = tourScheduled?.percentage || 0;

  // 見学進展率が10%未満で発動
  if (tourRate >= 10) return null;

  return {
    key: 'low_tour_conversion',
    title: '見学設定率が低い: アラート警告の重みを強化',
    rationale: `見学日程確定（tour_scheduled）への進展率が${tourRate}%と低いです。アラート警告の重みを+2して、見学日程提案のタスク優先度を上げる提案です。`,
    suggestedConfigPatch: {
      weights: {
        alerts_warning: 2,
      } as AiVpWeights,
    },
    confidence: confidence(metrics.totalTickets),
  };
}

/**
 * ルールC: ref別にaccepted率の差が大きい → ref別の重み調整提案
 */
function ruleRefPerformanceDiff(
  metrics: SalesMetricsAggregation,
  _currentConfig: AiVpConfig
): LeadScoreSuggestionItem | null {
  // ref が2つ以上あり、それぞれ十分なサンプルがある場合のみ
  const validRefs = metrics.refSuccessRates.filter((r) => r.total >= 3 && r.ref !== 'unknown');
  if (validRefs.length < 2) return null;

  const maxRate = Math.max(...validRefs.map((r) => r.rate));
  const minRate = Math.min(...validRefs.map((r) => r.rate));

  // 差が20ポイント以上で発動
  if (maxRate - minRate < 20) return null;

  const bestRef = validRefs.find((r) => r.rate === maxRate);
  const worstRef = validRefs.find((r) => r.rate === minRate);

  return {
    key: 'ref_performance_diff',
    title: '紹介元による成約率の差が大きい',
    rationale: `紹介元「${bestRef?.ref}」の成約率${maxRate}%に対し、「${worstRef?.ref}」は${minRate}%です。高成約率の紹介元からのリードを優先する重み調整を検討してください。`,
    suggestedConfigPatch: {
      weights: {
        contracts_decision_overdue: 1,
      } as AiVpWeights,
    },
    confidence: confidence(metrics.totalTickets),
  };
}

/**
 * ルールD: not_interested が多い → フィルタ強化提案
 */
function ruleHighNotInterested(
  metrics: SalesMetricsAggregation,
  _currentConfig: AiVpConfig
): LeadScoreSuggestionItem | null {
  if (metrics.totalTickets < MIN_SAMPLE_SIZE) return null;

  const notInterested = metrics.resultDistribution.find((d) => d.code === 'not_interested');
  const rate = notInterested?.percentage || 0;

  // 40%以上で発動
  if (rate < 40) return null;

  return {
    key: 'high_not_interested',
    title: '「興味なし」率が高い: 初期スクリーニング強化',
    rationale: `直近${metrics.rangeDays}日間で「興味なし」が${rate}%を占めています。初期の問い合わせフォーム改善や、リード品質の閾値引き上げを検討してください。`,
    suggestedConfigPatch: {
      thresholds: {
        severity_warning: 2,
      },
    } as Partial<AiVpConfig>,
    confidence: confidence(metrics.totalTickets),
  };
}

/**
 * ルールE: 全体の成約率が低い → receivables_overdue を微調整
 */
function ruleLowOverallAcceptance(
  metrics: SalesMetricsAggregation,
  _currentConfig: AiVpConfig
): LeadScoreSuggestionItem | null {
  if (metrics.totalTickets < MIN_SAMPLE_SIZE) return null;

  const accepted = metrics.resultDistribution.find((d) => d.code === 'accepted');
  const rate = accepted?.percentage || 0;

  // 5%未満で発動
  if (rate >= 5) return null;

  return {
    key: 'low_overall_acceptance',
    title: '全体の成約率が低い: 財務重みの見直し',
    rationale: `成約率が${rate}%と低く推移しています。パイプライン全体の品質向上を促すため、未収金超過の重みを微調整する提案です。`,
    suggestedConfigPatch: {
      weights: {
        receivables_overdue: 1,
      } as AiVpWeights,
    },
    confidence: confidence(metrics.totalTickets),
  };
}

// 全ルール
const ALL_RULES = [
  ruleSlaBreachHigh,
  ruleLowTourConversion,
  ruleRefPerformanceDiff,
  ruleHighNotInterested,
  ruleLowOverallAcceptance,
];

// ======== メインエントリポイント ========

/**
 * 提案を生成して保存
 *
 * @param rangeDays 集計対象期間（デフォルト14日）
 * @returns 生成された提案
 */
export function buildLeadScoreSuggestions(
  rangeDays: number = 14
): LeadScoreSuggestion {
  // 1. チケットを取得（システムユーザーとして全件取得）
  const systemViewer: ViewerContext = { userId: 'system', role: 'admin' };
  const { items: allTickets } = listTickets({ limit: 10000 }, systemViewer);

  // 2. 集計
  const metrics = aggregateMetrics(allTickets, rangeDays);

  // 3. 現在のAI VP設定を取得
  const currentConfig = getAiVpConfig();

  // 4. ルール適用
  const suggestions: LeadScoreSuggestionItem[] = [];
  for (const rule of ALL_RULES) {
    const suggestion = rule(metrics, currentConfig);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  // 5. 提案ドキュメントを作成
  const suggestion: LeadScoreSuggestion = {
    id: `lss_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    generatedAt: new Date().toISOString(),
    rangeDays,
    metrics,
    suggestions,
    status: 'open',
    actedByUserId: null,
    actedAt: null,
  };

  // 6. 保存
  saveSuggestion(suggestion);

  return suggestion;
}

/**
 * パッチを現在の設定に適用したプレビューを生成
 * ※ 設定は保存しない
 */
export function applyPatchPreview(
  patch: Partial<AiVpConfig>
): AiVpConfig {
  const current = getAiVpConfig();

  // パッチの weights は「差分」（delta）として扱う
  const mergedWeights = { ...current.weights };
  if (patch.weights) {
    for (const [key, delta] of Object.entries(patch.weights)) {
      if (typeof delta === 'number' && key in mergedWeights) {
        const currentVal = (mergedWeights as Record<string, number>)[key] || 0;
        const newVal = Math.min(100, Math.max(0, currentVal + delta));
        (mergedWeights as Record<string, number>)[key] = newVal;
      }
    }
  }

  const mergedThresholds = { ...current.thresholds };
  if (patch.thresholds) {
    for (const [key, delta] of Object.entries(patch.thresholds)) {
      if (typeof delta === 'number' && key in mergedThresholds) {
        const currentVal = (mergedThresholds as Record<string, number>)[key] || 0;
        const newVal = Math.max(0, currentVal + delta);
        (mergedThresholds as Record<string, number>)[key] = newVal;
      }
    }
  }

  return {
    weights: mergedWeights,
    thresholds: mergedThresholds,
    diversity: { ...current.diversity, ...patch.diversity },
  };
}
