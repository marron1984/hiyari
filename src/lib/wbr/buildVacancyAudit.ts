/**
 * 空室 週次棚卸し（Vacancy Inventory Check）
 *
 * Ticket 088: 空室 週次棚卸し（Inventory Check）をWBRに追加
 *
 * businessUnitId ごとに以下を算出:
 * - activeUnits: vacancy_units.status=active の件数
 * - totalAvailableCount: availableCount の合計
 * - staleUnits: updatedAt が古い（例：7日以上更新なし）の件数
 * - openSuggestions: vacancy_update_suggestions.status=open の件数
 * - pendingApprovals: 未適用提案数（openSuggestionsと同じ）
 * - appliedThisWeek: 今週適用された提案数
 *
 * アラート生成:
 * - vacancy_stale: staleUnits >= 3 の場合
 * - vacancy_suggestion_backlog: openSuggestions >= 5 の場合
 */

import { listVacancyUnits } from '@/lib/vacancyUnits/repo';
import { listSuggestions } from '@/lib/vacancySuggestions/repo';
import { createAlert } from '@/lib/alerts/repo';
import type { VacancyUnit } from '@/lib/vacancyUnits/types';
import type { VacancyUpdateSuggestion } from '@/lib/vacancySuggestions/types';

// ========== 型定義 ==========

/**
 * 空室棚卸し行（businessUnitごとの指標）
 */
export interface VacancyAuditRow {
  businessUnitId: string;
  businessUnitName?: string;
  activeUnits: number;
  totalAvailableCount: number;
  staleUnits: number;
  openSuggestions: number;
  pendingApprovals: number;
  appliedThisWeek: number;
}

/**
 * 週次棚卸し結果
 */
export interface VacancyAuditResult {
  rows: VacancyAuditRow[];
  totalActiveUnits: number;
  totalAvailableCount: number;
  totalStaleUnits: number;
  totalOpenSuggestions: number;
  totalAppliedThisWeek: number;
  generatedAlerts: {
    type: 'vacancy_stale' | 'vacancy_suggestion_backlog';
    businessUnitId: string;
    count: number;
  }[];
  auditedAt: string;
}

/**
 * 棚卸しオプション
 */
export interface VacancyAuditOptions {
  /** staleとみなす日数（デフォルト: 7日） */
  staleDays?: number;
  /** staleアラート閾値（デフォルト: 3件） */
  staleAlertThreshold?: number;
  /** 提案滞留アラート閾値（デフォルト: 5件） */
  suggestionBacklogThreshold?: number;
  /** アラートを作成するか（デフォルト: true） */
  createAlerts?: boolean;
  /** businessUnitId→名前のマップ（表示用） */
  businessUnitNames?: Record<string, string>;
}

// ========== ヘルパー ==========

/**
 * 今週の開始日時を取得（月曜日 00:00:00）
 */
function getWeekStartDate(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

/**
 * staleかどうかを判定（staleDays以上更新がない）
 */
function isStale(unit: VacancyUnit, staleDays: number): boolean {
  const updatedAt = new Date(unit.updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - updatedAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= staleDays;
}

/**
 * 今週適用されたかどうか
 */
function isAppliedThisWeek(suggestion: VacancyUpdateSuggestion, weekStart: Date): boolean {
  if (suggestion.status !== 'applied' || !suggestion.appliedAt) return false;
  const appliedAt = new Date(suggestion.appliedAt);
  return appliedAt >= weekStart;
}

// ========== メイン関数 ==========

/**
 * 週次空室棚卸しを実行
 */
export function auditWeeklyVacancies(options: VacancyAuditOptions = {}): VacancyAuditResult {
  const {
    staleDays = 7,
    staleAlertThreshold = 3,
    suggestionBacklogThreshold = 5,
    createAlerts: shouldCreateAlerts = true,
    businessUnitNames = {},
  } = options;

  const weekStart = getWeekStartDate();
  const now = new Date().toISOString();

  // データ取得
  const { items: allUnits } = listVacancyUnits({ limit: 10000 });
  const { items: allSuggestions } = listSuggestions({ limit: 10000 });

  // businessUnitIdでグループ化
  const unitsByBu = new Map<string, VacancyUnit[]>();
  const suggestionsByBu = new Map<string, VacancyUpdateSuggestion[]>();

  for (const unit of allUnits) {
    const list = unitsByBu.get(unit.businessUnitId) ?? [];
    list.push(unit);
    unitsByBu.set(unit.businessUnitId, list);
  }

  for (const suggestion of allSuggestions) {
    const list = suggestionsByBu.get(suggestion.businessUnitId) ?? [];
    list.push(suggestion);
    suggestionsByBu.set(suggestion.businessUnitId, list);
  }

  // すべてのbusinessUnitIdを収集
  const allBusinessUnitIds = new Set<string>();
  for (const buId of unitsByBu.keys()) allBusinessUnitIds.add(buId);
  for (const buId of suggestionsByBu.keys()) allBusinessUnitIds.add(buId);

  // businessUnitごとに集計
  const rows: VacancyAuditRow[] = [];
  const generatedAlerts: VacancyAuditResult['generatedAlerts'] = [];

  for (const businessUnitId of allBusinessUnitIds) {
    const units = unitsByBu.get(businessUnitId) ?? [];
    const suggestions = suggestionsByBu.get(businessUnitId) ?? [];

    // activeUnits
    const activeUnits = units.filter((u) => u.status === 'active').length;

    // totalAvailableCount
    const totalAvailableCount = units
      .filter((u) => u.status === 'active')
      .reduce((sum, u) => sum + u.availableCount, 0);

    // staleUnits（active かつ stale）
    const staleUnits = units.filter(
      (u) => u.status === 'active' && isStale(u, staleDays)
    ).length;

    // openSuggestions
    const openSuggestions = suggestions.filter((s) => s.status === 'open').length;

    // pendingApprovals（openと同義）
    const pendingApprovals = openSuggestions;

    // appliedThisWeek
    const appliedThisWeek = suggestions.filter((s) =>
      isAppliedThisWeek(s, weekStart)
    ).length;

    const row: VacancyAuditRow = {
      businessUnitId,
      businessUnitName: businessUnitNames[businessUnitId],
      activeUnits,
      totalAvailableCount,
      staleUnits,
      openSuggestions,
      pendingApprovals,
      appliedThisWeek,
    };
    rows.push(row);

    // アラート生成
    if (shouldCreateAlerts) {
      // staleアラート
      if (staleUnits >= staleAlertThreshold) {
        const fingerprint = `vacancy_stale:${businessUnitId}:weekly`;
        createAlert({
          type: 'vacancy_stale',
          sourceId: businessUnitId,
          title: '空室情報の更新が滞っています',
          message: `${businessUnitNames[businessUnitId] || businessUnitId} で ${staleUnits} 件の空室情報が ${staleDays} 日以上更新されていません`,
          severity: staleUnits >= 5 ? 'warning' : 'info',
          fingerprint,
          meta: { businessUnitId, staleUnits, staleDays },
        });
        generatedAlerts.push({
          type: 'vacancy_stale',
          businessUnitId,
          count: staleUnits,
        });
      }

      // 提案滞留アラート
      if (openSuggestions >= suggestionBacklogThreshold) {
        const fingerprint = `vacancy_suggestion_backlog:${businessUnitId}:weekly`;
        createAlert({
          type: 'vacancy_suggestion_backlog',
          sourceId: businessUnitId,
          title: '空室更新提案が滞留しています',
          message: `${businessUnitNames[businessUnitId] || businessUnitId} で ${openSuggestions} 件の空室更新提案が未処理です`,
          severity: openSuggestions >= 10 ? 'warning' : 'info',
          fingerprint,
          meta: { businessUnitId, openSuggestions },
        });
        generatedAlerts.push({
          type: 'vacancy_suggestion_backlog',
          businessUnitId,
          count: openSuggestions,
        });
      }
    }
  }

  // ソート（businessUnitId順）
  rows.sort((a, b) => a.businessUnitId.localeCompare(b.businessUnitId));

  // 全体集計
  const totalActiveUnits = rows.reduce((sum, r) => sum + r.activeUnits, 0);
  const totalAvailableCount = rows.reduce((sum, r) => sum + r.totalAvailableCount, 0);
  const totalStaleUnits = rows.reduce((sum, r) => sum + r.staleUnits, 0);
  const totalOpenSuggestions = rows.reduce((sum, r) => sum + r.openSuggestions, 0);
  const totalAppliedThisWeek = rows.reduce((sum, r) => sum + r.appliedThisWeek, 0);

  return {
    rows,
    totalActiveUnits,
    totalAvailableCount,
    totalStaleUnits,
    totalOpenSuggestions,
    totalAppliedThisWeek,
    generatedAlerts,
    auditedAt: now,
  };
}

/**
 * WBR用サマリーを取得（簡易版）
 */
export function getVacancyAuditSummary(): {
  activeUnits: number;
  totalAvailable: number;
  staleCount: number;
  openSuggestions: number;
  appliedThisWeek: number;
  health: 'good' | 'warning' | 'critical';
} {
  const result = auditWeeklyVacancies({ createAlerts: false });

  // ヘルス判定
  let health: 'good' | 'warning' | 'critical' = 'good';
  if (result.totalStaleUnits >= 5 || result.totalOpenSuggestions >= 10) {
    health = 'warning';
  }
  if (result.totalStaleUnits >= 10 || result.totalOpenSuggestions >= 20) {
    health = 'critical';
  }

  return {
    activeUnits: result.totalActiveUnits,
    totalAvailable: result.totalAvailableCount,
    staleCount: result.totalStaleUnits,
    openSuggestions: result.totalOpenSuggestions,
    appliedThisWeek: result.totalAppliedThisWeek,
    health,
  };
}
