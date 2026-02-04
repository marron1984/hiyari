/**
 * KPIハイライト生成ヘルパー
 *
 * Task 051: KPI辞書×異常検知×WBR 精度UP
 *
 * WBRのKPIハイライトが「意味・方向性・根拠」付きで安定表示される
 * 異常検知が辞書のルール/理由を参照して説明文を生成できる
 * 例外（辞書未整備KPI）があっても落ちない（フォールバック）
 */

import { getKPIDictionaryEntry } from '@/lib/kpiDictionary/repo';
import { getAnomalyRule } from '@/lib/kpiDictionary/anomalyRuleRepo';
import type { KPIDictionaryEntry, Direction, KPIAnomalyRule } from '@/lib/kpiDictionary/types';

// ========== 型定義 ==========

/**
 * WBR用KPIハイライト（整形済み）
 */
export interface WbrKpiHighlight {
  kpiId: string;
  name: string;
  displayValue: string;              // 例 "+15%" "前週比+3" 等
  previousValue: string | null;      // 前回値（表示用）
  changePercent: number;             // 変化率（-100〜+100等）
  trend: 'up' | 'down' | 'flat';
  direction: 'higher_is_better' | 'lower_is_better' | 'neutral' | 'unknown';
  whyItMatters: string | null;       // 1行（辞書から）
  explanation: string | null;        // 1行（任意：異常検知時のルール理由等）
  impact: 'high' | 'medium' | 'low'; // 影響度
  url: string;                       // /dashboard/kpi/[id] 等
  // 辞書メタデータ（オプション）
  dictionaryEntry: KPIDictionaryEntry | null;
  anomalyRule: KPIAnomalyRule | null;
  // 状態判定
  isGood: boolean;                   // direction と trend から算出
  isBad: boolean;
  isAnomaly: boolean;                // 異常検知ルールにヒットしているか
}

/**
 * 生KPIデータ入力
 */
export interface RawKpiData {
  kpiId: string;
  name?: string;                     // 名前（辞書から補完可）
  currentValue: number | string;
  previousValue?: number | string | null;
  unit?: string;
}

/**
 * ハイライト生成オプション
 */
export interface BuildKpiHighlightsOptions {
  /** カスタムURLプレフィックス */
  baseUrl?: string;
  /** 辞書未登録KPIのフォールバック名 */
  defaultName?: string;
  /** 変化率しきい値（flat判定用）*/
  flatThreshold?: number;
  /** 異常検知ルールを適用するか */
  applyAnomalyRules?: boolean;
}

// ========== ユーティリティ ==========

/**
 * 変化率を計算
 */
function calculateChangePercent(current: number | string, previous: number | string | null): number {
  const curr = typeof current === 'string' ? parseFloat(current) : current;
  const prev = typeof previous === 'string' ? parseFloat(previous || '0') : (previous ?? 0);

  if (isNaN(curr) || isNaN(prev) || prev === 0) {
    return 0;
  }

  return Math.round(((curr - prev) / Math.abs(prev)) * 100 * 10) / 10; // 小数点1桁
}

/**
 * トレンドを判定
 */
function determineTrend(
  changePercent: number,
  flatThreshold: number = 1
): 'up' | 'down' | 'flat' {
  if (changePercent > flatThreshold) return 'up';
  if (changePercent < -flatThreshold) return 'down';
  return 'flat';
}

/**
 * 方向性を取得（辞書から、なければ 'unknown'）
 */
function getDirection(entry: KPIDictionaryEntry | null): WbrKpiHighlight['direction'] {
  if (!entry) return 'unknown';
  return entry.direction;
}

/**
 * 良い/悪いを判定
 */
function determineGoodBad(
  trend: 'up' | 'down' | 'flat',
  direction: WbrKpiHighlight['direction']
): { isGood: boolean; isBad: boolean } {
  const isGood =
    (trend === 'up' && direction === 'higher_is_better') ||
    (trend === 'down' && direction === 'lower_is_better');

  const isBad =
    (trend === 'up' && direction === 'lower_is_better') ||
    (trend === 'down' && direction === 'higher_is_better');

  return { isGood, isBad };
}

/**
 * 影響度を算出
 */
function calculateImpact(
  changePercent: number,
  direction: WbrKpiHighlight['direction'],
  trend: 'up' | 'down' | 'flat',
  entry: KPIDictionaryEntry | null
): 'high' | 'medium' | 'low' {
  const absChange = Math.abs(changePercent);

  // 閾値がある場合はそれを参照
  if (entry?.thresholds) {
    const { warning, critical } = entry.thresholds;
    // TODO: 閾値ベースの判定を実装
  }

  // 変化率ベースの簡易判定
  if (absChange >= 20) return 'high';
  if (absChange >= 10) return 'medium';
  return 'low';
}

/**
 * 異常検知ルールをチェック
 */
function checkAnomaly(
  currentValue: number | string,
  previousValue: number | string | null,
  changePercent: number,
  rule: KPIAnomalyRule | null
): { isAnomaly: boolean; explanation: string | null } {
  if (!rule || !rule.enabled) {
    return { isAnomaly: false, explanation: null };
  }

  const curr = typeof currentValue === 'string' ? parseFloat(currentValue) : currentValue;

  // 閾値チェック
  if (rule.thresholdHigh !== null && curr > rule.thresholdHigh) {
    return {
      isAnomaly: true,
      explanation: rule.ruleReason || `値が上限閾値(${rule.thresholdHigh})を超過`,
    };
  }

  if (rule.thresholdLow !== null && curr < rule.thresholdLow) {
    return {
      isAnomaly: true,
      explanation: rule.ruleReason || `値が下限閾値(${rule.thresholdLow})を下回る`,
    };
  }

  // 変化率チェック
  if (rule.maxPercentChange !== null && Math.abs(changePercent) > rule.maxPercentChange) {
    return {
      isAnomaly: true,
      explanation: rule.ruleReason || `変化率が${rule.maxPercentChange}%を超過（${changePercent > 0 ? '+' : ''}${changePercent}%）`,
    };
  }

  return { isAnomaly: false, explanation: null };
}

/**
 * 表示用値をフォーマット
 */
function formatDisplayValue(
  value: number | string,
  unit?: string,
  entry?: KPIDictionaryEntry | null
): string {
  const unitStr = unit || entry?.unit || '';
  const numVal = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numVal)) {
    return `${value}${unitStr}`;
  }

  // パーセント形式
  if (unitStr === '%') {
    return `${numVal.toFixed(1)}%`;
  }

  // 通貨形式
  if (unitStr === '円' || unitStr === '¥') {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(numVal);
  }

  // 件数形式
  if (unitStr === '件' || unitStr === '人' || unitStr === '回') {
    return `${Math.round(numVal)}${unitStr}`;
  }

  // その他
  if (Number.isInteger(numVal)) {
    return `${numVal}${unitStr}`;
  }
  return `${numVal.toFixed(1)}${unitStr}`;
}

// ========== メイン関数 ==========

/**
 * 単一KPIのハイライトを生成
 */
export function buildSingleKpiHighlight(
  raw: RawKpiData,
  options: BuildKpiHighlightsOptions = {}
): WbrKpiHighlight {
  const {
    baseUrl = '/dashboard/kpi',
    defaultName = '不明なKPI',
    flatThreshold = 1,
    applyAnomalyRules = true,
  } = options;

  // 辞書エントリを取得（なければnull）
  const entry = getKPIDictionaryEntry(raw.kpiId);

  // 異常検知ルールを取得（なければnull）
  const anomalyRule = applyAnomalyRules ? getAnomalyRule(raw.kpiId) : null;

  // 変化率計算
  const changePercent = calculateChangePercent(raw.currentValue, raw.previousValue ?? null);

  // トレンド判定
  const trend = determineTrend(changePercent, flatThreshold);

  // 方向性取得
  const direction = getDirection(entry);

  // 良い/悪い判定
  const { isGood, isBad } = determineGoodBad(trend, direction);

  // 影響度算出
  const impact = calculateImpact(changePercent, direction, trend, entry);

  // 異常検知チェック
  const { isAnomaly, explanation: anomalyExplanation } = checkAnomaly(
    raw.currentValue,
    raw.previousValue ?? null,
    changePercent,
    anomalyRule
  );

  // 説明文を決定（異常検知 > カスタム > null）
  const explanation = anomalyExplanation;

  // 表示用値
  const displayValue = formatDisplayValue(raw.currentValue, raw.unit, entry);
  const previousValueDisplay = raw.previousValue !== undefined && raw.previousValue !== null
    ? formatDisplayValue(raw.previousValue, raw.unit, entry)
    : null;

  // 名前（辞書優先、なければraw、なければデフォルト）
  const name = entry?.name || raw.name || defaultName;

  // URL生成
  const url = entry?.dashboardPath || `${baseUrl}/${raw.kpiId}`;

  return {
    kpiId: raw.kpiId,
    name,
    displayValue,
    previousValue: previousValueDisplay,
    changePercent,
    trend,
    direction,
    whyItMatters: entry?.whyItMatters ?? null,
    explanation,
    impact,
    url,
    dictionaryEntry: entry,
    anomalyRule,
    isGood,
    isBad,
    isAnomaly,
  };
}

/**
 * 複数KPIのハイライトを一括生成
 */
export function buildKpiHighlights(
  rawData: RawKpiData[],
  options: BuildKpiHighlightsOptions = {}
): WbrKpiHighlight[] {
  return rawData.map((raw) => buildSingleKpiHighlight(raw, options));
}

/**
 * ハイライトをソート（影響度→変化率の大きさ順）
 */
export function sortHighlightsByImpact(highlights: WbrKpiHighlight[]): WbrKpiHighlight[] {
  const impactOrder = { high: 0, medium: 1, low: 2 };

  return [...highlights].sort((a, b) => {
    // 異常検知を最優先
    if (a.isAnomaly && !b.isAnomaly) return -1;
    if (!a.isAnomaly && b.isAnomaly) return 1;

    // 次に影響度
    const impactDiff = impactOrder[a.impact] - impactOrder[b.impact];
    if (impactDiff !== 0) return impactDiff;

    // 最後に変化率の大きさ
    return Math.abs(b.changePercent) - Math.abs(a.changePercent);
  });
}

/**
 * トップNのハイライトを取得
 */
export function getTopHighlights(
  highlights: WbrKpiHighlight[],
  maxItems: number = 5
): WbrKpiHighlight[] {
  return sortHighlightsByImpact(highlights).slice(0, maxItems);
}

/**
 * WbrKpiHighlight から旧 KPIHighlight 形式に変換
 * （既存コンポーネントとの互換性のため）
 */
export function toKPIHighlight(wbrHighlight: WbrKpiHighlight): {
  name: string;
  currentValue: number | string;
  previousValue: number | string;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
  impact: 'high' | 'medium' | 'low';
  insight: string;
  directionMeaning?: 'higher_is_better' | 'lower_is_better' | 'neutral' | null;
  whyItMatters?: string | null;
} {
  return {
    name: wbrHighlight.name,
    currentValue: wbrHighlight.displayValue,
    previousValue: wbrHighlight.previousValue || '',
    changePercent: wbrHighlight.changePercent,
    direction: wbrHighlight.trend === 'flat' ? 'stable' : wbrHighlight.trend,
    impact: wbrHighlight.impact,
    insight: wbrHighlight.explanation || '',
    directionMeaning: wbrHighlight.direction === 'unknown' ? null : wbrHighlight.direction,
    whyItMatters: wbrHighlight.whyItMatters,
  };
}

/**
 * 複数のWbrKpiHighlightを旧形式に変換
 */
export function toKPIHighlights(wbrHighlights: WbrKpiHighlight[]): ReturnType<typeof toKPIHighlight>[] {
  return wbrHighlights.map(toKPIHighlight);
}
