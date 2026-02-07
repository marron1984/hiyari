/**
 * MBR改善タスク期限超過スキャナー
 *
 * Ticket 130: MBR改善タスクの期限超過エスカレーション
 *
 * 検知条件:
 * - sourceType = 'mbr_focus'
 * - status in (open, in_progress, blocked)
 * - dueAt < now
 *
 * 分類:
 * - overdueDays >= 7 → critical
 * - overdueDays >= 1 → warning
 */

import type { CorrectiveAction } from '@/lib/correctiveActions/types';
import { listCorrectiveActions } from '@/lib/correctiveActions/repo';
import type { ViewerContext } from '@/lib/correctiveActions/types';
import type { CreateAlertRequest, AlertSeverity } from '@/lib/alerts/types';

const SYSTEM_VIEWER: ViewerContext = { userId: 'system', role: 'admin' };

/** 期限超過日数を計算 */
export function calcOverdueDays(dueAt: string, now: Date = new Date()): number {
  const due = new Date(dueAt);
  const diffMs = now.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** MBR改善タスクの期限超過アイテムを取得 */
export interface MbrOverdueItem {
  action: CorrectiveAction;
  overdueDays: number;
}

export function scanMbrActionsOverdue(nowDate?: Date): MbrOverdueItem[] {
  const now = nowDate ?? new Date();

  // sourceType='mbr_focus' のアクティブなタスクを取得
  const { items } = listCorrectiveActions(SYSTEM_VIEWER, {
    sourceType: 'mbr_focus',
    limit: 1000,
  });

  const activeStatuses = new Set(['open', 'in_progress', 'blocked', 'pending_review']);
  const overdueItems: MbrOverdueItem[] = [];

  for (const action of items) {
    if (!activeStatuses.has(action.status)) continue;
    if (!action.dueAt) continue;

    const overdueDays = calcOverdueDays(action.dueAt, now);
    if (overdueDays >= 1) {
      overdueItems.push({ action, overdueDays });
    }
  }

  return overdueItems;
}

/** 期限超過アイテムからアラートリクエストを生成 */
export function buildMbrOverdueAlert(
  overdueItems: MbrOverdueItem[],
  date: string
): CreateAlertRequest | null {
  if (overdueItems.length === 0) return null;

  const overdue7Items = overdueItems.filter((i) => i.overdueDays >= 7);
  const overdueCount = overdueItems.length;
  const overdue7Count = overdue7Items.length;

  const severity: AlertSeverity = overdue7Count > 0 ? 'critical' : 'warning';

  const message =
    overdue7Count > 0
      ? `期限超過: ${overdueCount}件（7日超: ${overdue7Count}件）`
      : `期限超過: ${overdueCount}件`;

  return {
    type: 'mbr_action_overdue',
    sourceId: null,
    title: 'MBR改善タスク 期限超過',
    message,
    severity,
    fingerprint: `mbr_action_overdue:${date}`,
    assignedRole: 'manager',
    meta: {
      overdueCount,
      overdue7Count,
      url: '/dashboard/corrective-actions?sourceType=mbr_focus&overdue=true',
      items: overdueItems.slice(0, 5).map((i) => ({
        id: i.action.id,
        title: i.action.title,
        overdueDays: i.overdueDays,
      })),
    },
  };
}

/** スキャン結果のサマリー */
export interface MbrOverdueScanResult {
  overdueCount: number;
  overdue7Count: number;
  items: MbrOverdueItem[];
}

export function getMbrOverdueSummary(nowDate?: Date): MbrOverdueScanResult {
  const items = scanMbrActionsOverdue(nowDate);
  return {
    overdueCount: items.length,
    overdue7Count: items.filter((i) => i.overdueDays >= 7).length,
    items,
  };
}
