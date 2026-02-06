/**
 * MBR 改善タスク進捗集計
 *
 * Ticket 129: corrective-actions の sourceType='mbr_focus' を
 * MBR生成時に集計し、改善ループのフィードバックを提供する
 */

import { listCorrectiveActions } from '@/lib/correctiveActions/repo';
import type { CorrectiveAction, ViewerContext } from '@/lib/correctiveActions/types';
import type { MbrImprovementProgressSection, MbrImprovementMonth } from './types';

const SYSTEM_VIEWER: ViewerContext = { userId: 'system', role: 'admin' };

/**
 * sourceId から MBR月を抽出
 * sourceId format: `mbr:{YYYY-MM}:{hash}`
 */
export function extractMonthFromSourceId(sourceId: string | null): string | null {
  if (!sourceId) return null;
  const match = sourceId.match(/^mbr:(\d{4}-\d{2}):/);
  return match ? match[1] : null;
}

/**
 * 過去N月分の YYYY-MM リストを生成（対象月を含む）
 */
export function getRecentMonths(targetMonth: string, count: number): string[] {
  const [year, mon] = targetMonth.split('-').map(Number);
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(year, mon - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * 是正措置が期限超過かどうか
 */
function isOverdue(ca: CorrectiveAction): boolean {
  if (!ca.dueAt) return false;
  if (['completed', 'closed', 'cancelled'].includes(ca.status)) return false;
  return new Date(ca.dueAt) < new Date();
}

/**
 * 是正措置が「完了」状態かどうか
 */
function isDone(ca: CorrectiveAction): boolean {
  return ['completed', 'closed'].includes(ca.status);
}

/**
 * 月別の改善タスク進捗を集計
 */
function buildMonthProgress(
  actions: CorrectiveAction[],
  month: string
): MbrImprovementMonth {
  const monthActions = actions.filter(
    (ca) => extractMonthFromSourceId(ca.sourceId) === month
  );

  let openCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;
  let overdueCount = 0;

  for (const ca of monthActions) {
    if (isDone(ca) || ca.status === 'cancelled') {
      completedCount++;
    } else if (ca.status === 'in_progress' || ca.status === 'pending_review') {
      inProgressCount++;
    } else {
      openCount++;
    }
    if (isOverdue(ca)) {
      overdueCount++;
    }
  }

  const total = monthActions.length;
  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return {
    month,
    openCount,
    inProgressCount,
    completedCount,
    completionRate,
    overdueCount,
    total,
  };
}

/**
 * MBR 改善タスク進捗セクションを構築
 *
 * @param targetMonth MBR対象月（この月を含む過去3ヶ月分を集計）
 */
export function buildImprovementProgress(
  targetMonth: string
): MbrImprovementProgressSection {
  // mbr_focus の全是正措置を取得
  const { items: allMbrActions } = listCorrectiveActions(SYSTEM_VIEWER, {
    sourceType: 'mbr_focus',
    limit: 1000,
  });

  // 過去3ヶ月分
  const months = getRecentMonths(targetMonth, 3);
  const byMonth = months.map((m) => buildMonthProgress(allMbrActions, m));

  // 全体集計
  const allRelevant = allMbrActions.filter(
    (ca) => {
      const m = extractMonthFromSourceId(ca.sourceId);
      return m !== null && months.includes(m);
    }
  );

  const totalTasks = allRelevant.length;
  const totalDone = allRelevant.filter(isDone).length;
  const overallCompletionRate = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  // 詰まり上位: blocked = in_progress + pending_review で長期化しているもの
  const blocked = allRelevant
    .filter((ca) => ca.status === 'in_progress' || ca.status === 'pending_review')
    .slice(0, 3)
    .map((ca) => ({ id: ca.id, title: ca.title }));

  // overdue上位
  const overdue = allRelevant
    .filter(isOverdue)
    .slice(0, 3)
    .map((ca) => ({ id: ca.id, title: ca.title }));

  return {
    byMonth,
    totalTasks,
    totalDone,
    overallCompletionRate,
    blockedTop: blocked,
    overdueTop: overdue,
  };
}
