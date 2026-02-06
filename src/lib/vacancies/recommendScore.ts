/**
 * 空室おすすめ順スコアリング
 *
 * Ticket 090: 空室おすすめ順ランキング（成約しやすい順のスコアリング）
 *
 * /vacancies のデフォルト並びを "成約しやすい順" に最適化
 * ルールベースのスコアリング（AI不要）
 *
 * スコア要素:
 * - availableCount > 0 : +30
 * - availableFrom が近い（7日以内）: +20
 * - priceRange が安い（businessUnit内で相対的に下位30%）: +10
 * - conditionsJson が少ない（制約少）: +10
 * - 最近の問い合わせ多い: +5（072 events がある場合）
 *
 * ペナルティ:
 * - status=paused : -999（非表示推奨）
 * - stale（更新7日超）: -10
 */

import type { VacancyUnit, PriceRange, CareConditions } from '@/lib/vacancyUnits/types';

// ========== 型定義 ==========

/**
 * スコア付き空室ユニット
 */
export type ScoredVacancy = VacancyUnit & {
  score: number;
  scoreReason: string[];
};

/**
 * スコアリングオプション
 */
export interface ScoreOptions {
  /** 入居可能日の近さ判定日数（デフォルト: 7日） */
  availableFromDays?: number;
  /** staleとみなす日数（デフォルト: 7日） */
  staleDays?: number;
  /** 問い合わせイベントを考慮するか（デフォルト: true） */
  useInquiryEvents?: boolean;
  /** 問い合わせイベントの期間（日数、デフォルト: 30日） */
  inquiryEventDays?: number;
  /** pausedを除外するか（デフォルト: true） */
  excludePaused?: boolean;
}

/**
 * 問い合わせイベントのカウント（vacancyUnitId -> count）
 */
export type InquiryEventCounts = Map<string, number>;

// ========== スコア定数 ==========

const SCORE = {
  // 基本スコア
  HAS_AVAILABILITY: 30,        // availableCount > 0
  AVAILABLE_SOON: 20,          // availableFrom が近い
  PRICE_ATTRACTIVE: 10,        // 価格が安い（相対的）
  LOW_RESTRICTIONS: 10,        // 制約が少ない
  RECENT_INQUIRIES: 5,         // 最近の問い合わせ多い

  // ペナルティ
  PAUSED_PENALTY: -999,        // status=paused
  STALE_PENALTY: -10,          // 更新が古い
} as const;

// ========== ヘルパー関数 ==========

/**
 * 日付が今日から指定日数以内かどうか
 */
function isWithinDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false;
  const targetDate = new Date(dateStr);
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

/**
 * 更新日が指定日数以上前かどうか（stale判定）
 */
function isStale(updatedAt: string, days: number): boolean {
  const updatedDate = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - updatedDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > days;
}

/**
 * 月額料金の中央値を取得
 */
function getMedianMonthlyPrice(priceRange: PriceRange): number | null {
  const min = priceRange.monthlyMin;
  const max = priceRange.monthlyMax;
  if (min == null && max == null) return null;
  if (min == null) return max!;
  if (max == null) return min;
  return (min + max) / 2;
}

/**
 * 条件の制約数をカウント（制約が多いほど高い値）
 */
function countRestrictions(conditions: CareConditions): number {
  let count = 0;

  // 介護度制限
  if (conditions.minCareLevel != null && conditions.minCareLevel > 1) count++;
  if (conditions.maxCareLevel != null && conditions.maxCareLevel < 5) count++;

  // 受入不可条件
  if (conditions.acceptsDementia === false) count++;
  if (conditions.acceptsMedicalCare === false) count++;
  if (conditions.acceptsTerminalCare === false) count++;

  return count;
}

/**
 * businessUnitごとの価格分布を計算（下位30%のしきい値を返す）
 */
function calculatePriceThresholds(
  units: VacancyUnit[]
): Map<string, number> {
  const thresholds = new Map<string, number>();

  // businessUnitごとにグループ化
  const byBu = new Map<string, number[]>();
  for (const unit of units) {
    if (unit.status !== 'active') continue;
    const price = getMedianMonthlyPrice(unit.priceRangeJson);
    if (price == null) continue;

    const list = byBu.get(unit.businessUnitId) ?? [];
    list.push(price);
    byBu.set(unit.businessUnitId, list);
  }

  // 各businessUnitで下位30%のしきい値を計算
  for (const [buId, prices] of byBu) {
    if (prices.length < 3) {
      // 3件未満は全て「安い」扱い
      thresholds.set(buId, Infinity);
      continue;
    }

    prices.sort((a, b) => a - b);
    const threshold30Index = Math.floor(prices.length * 0.3);
    thresholds.set(buId, prices[threshold30Index]);
  }

  return thresholds;
}

// ========== メイン関数 ==========

/**
 * 単一のVacancyUnitにスコアを付与
 */
export function scoreVacancy(
  unit: VacancyUnit,
  priceThreshold: number | undefined,
  inquiryCount: number,
  options: ScoreOptions = {}
): ScoredVacancy {
  const {
    availableFromDays = 7,
    staleDays = 7,
  } = options;

  let score = 0;
  const reasons: string[] = [];

  // === ペナルティ（先に適用） ===

  // status=paused
  if (unit.status === 'paused') {
    score += SCORE.PAUSED_PENALTY;
    reasons.push('一時停止中');
  }

  // stale（更新が古い）
  if (isStale(unit.updatedAt, staleDays)) {
    score += SCORE.STALE_PENALTY;
    reasons.push(`${staleDays}日以上未更新`);
  }

  // === 加点要素 ===

  // availableCount > 0
  if (unit.availableCount > 0) {
    score += SCORE.HAS_AVAILABILITY;
    reasons.push(`空室あり(${unit.availableCount}室)`);
  }

  // availableFrom が近い
  if (isWithinDays(unit.availableFrom, availableFromDays)) {
    score += SCORE.AVAILABLE_SOON;
    reasons.push(`入居可能日が近い`);
  }

  // 価格が安い（相対的）
  if (priceThreshold !== undefined) {
    const price = getMedianMonthlyPrice(unit.priceRangeJson);
    if (price != null && price <= priceThreshold) {
      score += SCORE.PRICE_ATTRACTIVE;
      reasons.push('価格が魅力的');
    }
  }

  // 制約が少ない
  const restrictions = countRestrictions(unit.conditionsJson);
  if (restrictions === 0) {
    score += SCORE.LOW_RESTRICTIONS;
    reasons.push('受入制限なし');
  }

  // 最近の問い合わせが多い
  if (inquiryCount >= 3) {
    score += SCORE.RECENT_INQUIRIES;
    reasons.push('人気物件');
  }

  return {
    ...unit,
    score,
    scoreReason: reasons,
  };
}

/**
 * 複数のVacancyUnitにスコアを付与してソート
 */
export function scoreAndSortVacancies(
  units: VacancyUnit[],
  inquiryCounts?: InquiryEventCounts,
  options: ScoreOptions = {}
): ScoredVacancy[] {
  const { excludePaused = true } = options;

  // 価格しきい値を計算
  const priceThresholds = calculatePriceThresholds(units);

  // スコア付与
  const scored = units.map((unit) => {
    const priceThreshold = priceThresholds.get(unit.businessUnitId);
    const inquiryCount = inquiryCounts?.get(unit.id) ?? 0;
    return scoreVacancy(unit, priceThreshold, inquiryCount, options);
  });

  // pausedを除外（オプション）
  let filtered = scored;
  if (excludePaused) {
    filtered = scored.filter((v) => v.status !== 'paused');
  }

  // スコア降順でソート（同点なら空室数、次に更新日時）
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return filtered;
}

/**
 * 問い合わせイベントからvacancyUnitごとのカウントを集計
 *
 * @param events - VacancyInquiryEvent の配列
 * @param eventTypes - カウント対象のイベントタイプ（デフォルト: click_inquiry, submit）
 */
export function countInquiryEvents(
  events: Array<{ vacancyUnitId: string | null; eventType: string }>,
  eventTypes: string[] = ['click_inquiry', 'submit']
): InquiryEventCounts {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (!event.vacancyUnitId) continue;
    if (!eventTypes.includes(event.eventType)) continue;

    const current = counts.get(event.vacancyUnitId) ?? 0;
    counts.set(event.vacancyUnitId, current + 1);
  }

  return counts;
}

/**
 * スコア定数をエクスポート（テスト・調整用）
 */
export const SCORE_CONSTANTS = SCORE;
