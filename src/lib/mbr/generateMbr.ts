/**
 * MBR (Monthly Business Review) 自動生成エンジン
 *
 * Ticket 126: 月次改善レビュー自動生成
 *
 * 参照データ:
 * A) Vacancy funnel（vacancy_inquiry チケット）
 * B) Sales task（sales_next_action チケット）
 * C) AI VP 設定変更履歴（settings events）
 * D) 改善提案（leadScore suggestions）
 * E) 運用（weekly-ops runs）
 */

import { listTickets } from '@/lib/tickets/repo';
import type { Ticket, ViewerContext, SalesResultCode } from '@/lib/tickets/types';
import { getAiVpSettingsEvents } from '@/lib/aiVp/settings';
import { getSuggestions } from '@/lib/sales/suggestionsRepo';
import { listRecentRuns } from '@/lib/weeklyOps/repo';
import type {
  Mbr,
  MbrFunnelSection,
  MbrSalesSection,
  MbrAiVpChangesSection,
  MbrSuggestionsSection,
  MbrOpsSection,
  MbrImprovementProgressSection,
} from './types';
import { buildImprovementProgress } from './buildImprovementProgress';

// ======== ヘルパー ========

const SYSTEM_VIEWER: ViewerContext = { userId: 'system', role: 'admin' };

/** 月の開始日・終了日を取得 */
export function getMonthRange(month: string): { start: Date; end: Date } {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(year, m - 1, 1);
  const end = new Date(year, m, 0, 23, 59, 59, 999);
  return { start, end };
}

/** チケットが対象月内か判定 */
function isInMonth(dateStr: string | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

/** 前月を取得 (YYYY-MM) */
export function getPreviousMonth(base: Date = new Date()): string {
  const d = new Date(base);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ======== セクション生成 ========

/**
 * A) Vacancy funnel
 */
export function buildFunnelSection(tickets: Ticket[], start: Date, end: Date): MbrFunnelSection {
  const vacancyTickets = tickets.filter(
    (t) => t.relatedType === 'vacancy_inquiry' && isInMonth(t.createdAt, start, end)
  );

  // ステータス別集計
  const byStatus: Record<string, number> = {};
  for (const t of vacancyTickets) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }

  // SLA超過
  const closed = vacancyTickets.filter((t) => t.closedAt);
  let slaBreachCount = 0;
  let totalDaysToClose = 0;
  let closedCount = 0;

  for (const t of closed) {
    const created = new Date(t.createdAt);
    const closedDate = new Date(t.closedAt!);
    const days = (closedDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    totalDaysToClose += days;
    closedCount++;

    if (t.dueAt && closedDate > new Date(t.dueAt)) {
      slaBreachCount++;
    }
  }

  // ref別集計（businessUnitId代用）
  const refMap = new Map<string, { inquiries: number; accepted: number }>();
  for (const t of vacancyTickets) {
    const ref = t.businessUnitId || 'unknown';
    const entry = refMap.get(ref) || { inquiries: 0, accepted: 0 };
    entry.inquiries++;
    if (t.status === 'closed' || t.status === 'resolved') {
      entry.accepted++;
    }
    refMap.set(ref, entry);
  }

  return {
    inquiries: vacancyTickets.length,
    byStatus,
    slaBreachCount,
    slaBreachRate: vacancyTickets.length > 0 ? Math.round((slaBreachCount / vacancyTickets.length) * 100) : 0,
    refTop: Array.from(refMap.entries())
      .map(([ref, data]) => ({ ref, ...data }))
      .sort((a, b) => b.inquiries - a.inquiries)
      .slice(0, 5),
    avgDaysToClose: closedCount > 0 ? Math.round(totalDaysToClose / closedCount * 10) / 10 : 0,
  };
}

/**
 * B) Sales task
 */
export function buildSalesSection(tickets: Ticket[], start: Date, end: Date): MbrSalesSection {
  const salesTickets = tickets.filter(
    (t) => t.relatedType === 'sales_next_action' && isInMonth(t.createdAt, start, end)
  );
  const completed = salesTickets.filter((t) => t.status === 'closed' || t.status === 'resolved');

  // resultCode分布
  const codeCounts = new Map<string, number>();
  for (const t of completed) {
    const code = t.meta?.resultCode || 'unknown';
    codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  }

  const resultDistribution = Array.from(codeCounts.entries())
    .map(([code, count]) => ({
      code,
      count,
      percentage: completed.length > 0 ? Math.round((count / completed.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // 平均リードタイム
  let totalDays = 0;
  let measured = 0;
  for (const t of completed) {
    if (t.closedAt) {
      const days = (new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      totalDays += days;
      measured++;
    }
  }

  return {
    generated: salesTickets.length,
    completed: completed.length,
    completionRate: salesTickets.length > 0 ? Math.round((completed.length / salesTickets.length) * 100) : 0,
    resultDistribution,
    avgLeadTimeDays: measured > 0 ? Math.round(totalDays / measured * 10) / 10 : 0,
  };
}

/**
 * C) AI VP 設定変更履歴
 */
export function buildAiVpChangesSection(start: Date, end: Date): MbrAiVpChangesSection {
  const allEvents = getAiVpSettingsEvents(100);
  const monthEvents = allEvents.filter((e) => isInMonth(e.createdAt, start, end));

  const byAction: Record<string, number> = {};
  for (const e of monthEvents) {
    byAction[e.action] = (byAction[e.action] || 0) + 1;
  }

  return {
    totalEvents: monthEvents.length,
    byAction,
    recentEvents: monthEvents.slice(0, 3).map((e) => ({
      id: e.id,
      action: e.action,
      createdAt: e.createdAt,
      note: e.note,
    })),
  };
}

/**
 * D) 改善提案（leadScore suggestions）
 */
export function buildSuggestionsSection(start: Date, end: Date): MbrSuggestionsSection {
  const allSuggestions = getSuggestions(100);
  const monthSuggestions = allSuggestions.filter((s) => isInMonth(s.generatedAt, start, end));

  let openCount = 0;
  let acceptedCount = 0;
  let dismissedCount = 0;
  const acceptedKeys: string[] = [];

  for (const s of monthSuggestions) {
    switch (s.status) {
      case 'open':
        openCount++;
        break;
      case 'accepted':
        acceptedCount++;
        for (const item of s.suggestions) {
          acceptedKeys.push(item.key);
        }
        break;
      case 'dismissed':
        dismissedCount++;
        break;
    }
  }

  return { openCount, acceptedCount, dismissedCount, acceptedKeys };
}

/**
 * E) 運用（Ops）
 */
export function buildOpsSection(start: Date, end: Date): MbrOpsSection {
  const runs = listRecentRuns(50);
  const monthRuns = runs.filter((r) => isInMonth(r.startedAt, start, end));

  let failedRunCount = 0;
  const failedStepsSet = new Set<string>();
  let totalItemsProcessed = 0;
  let totalAlertsCreated = 0;

  for (const r of monthRuns) {
    if (!r.ok) {
      failedRunCount++;
      if (r.failedSteps) {
        for (const s of r.failedSteps) {
          failedStepsSet.add(s);
        }
      }
    }
    totalItemsProcessed += r.totalItemsProcessed;
    totalAlertsCreated += r.totalAlertsCreated;
  }

  return {
    weeklyRunCount: monthRuns.length,
    failedRunCount,
    failedSteps: Array.from(failedStepsSet),
    totalItemsProcessed,
    totalAlertsCreated,
  };
}

// ======== Executive Summary 生成 ========

function buildExecSummary(
  funnel: MbrFunnelSection,
  sales: MbrSalesSection,
  aiVpChanges: MbrAiVpChangesSection,
  suggestions: MbrSuggestionsSection,
  ops: MbrOpsSection,
  improvementProgress: MbrImprovementProgressSection,
): string[] {
  const lines: string[] = [];

  // 空室パイプライン
  if (funnel.inquiries > 0) {
    const resolvedCount = (funnel.byStatus['resolved'] || 0) + (funnel.byStatus['closed'] || 0);
    lines.push(
      `空室問い合わせ ${funnel.inquiries}件、対応完了 ${resolvedCount}件（SLA超過率 ${funnel.slaBreachRate}%）`
    );
  } else {
    lines.push('空室問い合わせ: 今月のデータなし');
  }

  // 営業タスク
  if (sales.generated > 0) {
    lines.push(
      `営業タスク ${sales.generated}件生成、${sales.completed}件完了（完了率 ${sales.completionRate}%）`
    );
  } else {
    lines.push('営業タスク: 今月のデータなし');
  }

  // AI VP 設定変更
  if (aiVpChanges.totalEvents > 0) {
    lines.push(`AI VP設定変更 ${aiVpChanges.totalEvents}回（${Object.entries(aiVpChanges.byAction).map(([k, v]) => `${k}: ${v}`).join(', ')}）`);
  }

  // 運用
  if (ops.failedRunCount > 0) {
    lines.push(
      `運用: ${ops.weeklyRunCount}回実行、${ops.failedRunCount}回失敗（${ops.failedSteps.join(', ')}）`
    );
  } else if (ops.weeklyRunCount > 0) {
    lines.push(`運用: ${ops.weeklyRunCount}回実行、全て正常`);
  }

  // 改善タスク進捗（Ticket 129）
  if (improvementProgress.totalTasks > 0) {
    lines.push(
      `改善タスク: ${improvementProgress.totalTasks}件中 ${improvementProgress.totalDone}件完了（完了率 ${improvementProgress.overallCompletionRate}%）`
    );
  }

  // Ticket 132: blocked理由トップ
  if (improvementProgress.blockedTopReasons.length > 0) {
    const top = improvementProgress.blockedTopReasons
      .map((r) => `${r.label}(${r.count}件)`)
      .join('、');
    lines.push(`改善タスク詰まり原因: ${top}`);
  }

  return lines;
}

// ======== Next Month Focus 生成 ========

function buildNextMonthFocus(
  funnel: MbrFunnelSection,
  sales: MbrSalesSection,
  suggestions: MbrSuggestionsSection,
  ops: MbrOpsSection,
  improvementProgress: MbrImprovementProgressSection,
): string[] {
  const focus: string[] = [];

  // SLA超過が高い
  if (funnel.slaBreachRate > 20) {
    focus.push(`空室問い合わせのSLA超過率（${funnel.slaBreachRate}%）を改善する。初期対応フローの見直し。`);
  }

  // 営業完了率が低い
  if (sales.generated > 0 && sales.completionRate < 60) {
    focus.push(`営業タスク完了率（${sales.completionRate}%）向上。担当者の負荷分散を検討。`);
  }

  // 未対応の提案がある
  if (suggestions.openCount > 0) {
    focus.push(`未対応のleadScore改善提案 ${suggestions.openCount}件を確認・判断する。`);
  }

  // 運用失敗がある
  if (ops.failedRunCount > 0) {
    focus.push(`運用ジョブ失敗（${ops.failedSteps.join(', ')}）の根本原因を調査・修正。`);
  }

  // Ticket 132: blocked理由がある場合
  if (improvementProgress.blockedTopReasons.length > 0) {
    const topReason = improvementProgress.blockedTopReasons[0];
    focus.push(`改善タスクの詰まり原因「${topReason.label}」（${topReason.count}件）を解消する。`);
  }

  if (focus.length === 0) {
    focus.push('特記すべき課題なし。現在のオペレーションを継続。');
  }

  return focus;
}

// ======== メインエントリポイント ========

/**
 * MBRを生成
 *
 * @param month 対象月（YYYY-MM）。省略時は前月。
 */
export function generateMbr(month?: string): Mbr {
  const targetMonth = month || getPreviousMonth();
  const { start, end } = getMonthRange(targetMonth);

  // チケット全件取得（システムユーザー）
  const { items: allTickets } = listTickets({ limit: 10000 }, SYSTEM_VIEWER);

  // 各セクション生成
  const funnel = buildFunnelSection(allTickets, start, end);
  const sales = buildSalesSection(allTickets, start, end);
  const aiVpChanges = buildAiVpChangesSection(start, end);
  const suggestions = buildSuggestionsSection(start, end);
  const ops = buildOpsSection(start, end);
  const improvementProgress = buildImprovementProgress(targetMonth);

  // サマリー生成
  const execSummary = buildExecSummary(funnel, sales, aiVpChanges, suggestions, ops, improvementProgress);
  const nextMonthFocus = buildNextMonthFocus(funnel, sales, suggestions, ops, improvementProgress);

  return {
    id: `mbr_${targetMonth}_${Date.now()}`,
    month: targetMonth,
    generatedAt: new Date().toISOString(),
    sections: {
      execSummary,
      funnel,
      sales,
      aiVpChanges,
      suggestions,
      ops,
      improvementProgress,
      nextMonthFocus,
    },
  };
}
