/**
 * チケット滞留検知
 *
 * アラートセンターとの連携用
 * - urgent open >= 5 で critical alert
 * - overdue >= 10 で warning alert
 */

import { getOverdueTickets, listTickets } from './repo';
import { createAlert } from '@/lib/alerts/repo';
import type { ViewerContext } from './types';

// 検知ルール設定
const RULES = {
  urgentOpenThreshold: 5,    // urgent openがこの数以上でcritical
  overdueThreshold: 10,       // overdueがこの数以上でwarning
};

// 管理者用ビューアー（全データ閲覧可）
const ADMIN_VIEWER: ViewerContext = {
  userId: 'system',
  role: 'admin',
};

/**
 * チケット滞留をスキャンしてアラートを生成
 */
export function detectTicketBacklog(): {
  urgentOpenCount: number;
  overdueCount: number;
  alertsCreated: number;
} {
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

  let alertsCreated = 0;

  // urgent openの数を取得
  const { items: urgentItems } = listTickets(
    { priority: 'urgent' },
    ADMIN_VIEWER
  );
  const urgentOpenCount = urgentItems.filter(
    (t) => ['open', 'in_progress', 'waiting'].includes(t.status)
  ).length;

  // overdueの数を取得
  const overdueTickets = getOverdueTickets();
  const overdueCount = overdueTickets.length;

  // urgent open >= threshold で critical alert
  if (urgentOpenCount >= RULES.urgentOpenThreshold) {
    const fingerprint = `ticket:backlog:urgent:${dateKey}`;
    const alert = createAlert({
      type: 'ticket_backlog',
      sourceId: null,
      title: `チケット滞留：緊急チケットが${urgentOpenCount}件`,
      message: `緊急（urgent）のチケットが${urgentOpenCount}件オープンになっています。優先的に対応してください。`,
      severity: 'critical',
      fingerprint,
      assignedRole: 'manager',
      meta: {
        urgentOpenCount,
        threshold: RULES.urgentOpenThreshold,
        detectedAt: now.toISOString(),
        url: '/dashboard/tickets?priority=urgent',
      },
    });
    if (alert) alertsCreated++;
  }

  // overdue >= threshold で warning alert
  if (overdueCount >= RULES.overdueThreshold) {
    const fingerprint = `ticket:backlog:overdue:${dateKey}`;
    const alert = createAlert({
      type: 'ticket_backlog',
      sourceId: null,
      title: `チケット滞留：期限超過が${overdueCount}件`,
      message: `期限超過のチケットが${overdueCount}件あります。対応状況を確認してください。`,
      severity: 'warning',
      fingerprint,
      assignedRole: 'manager',
      meta: {
        overdueCount,
        threshold: RULES.overdueThreshold,
        detectedAt: now.toISOString(),
        url: '/dashboard/tickets?overdue=true',
      },
    });
    if (alert) alertsCreated++;
  }

  return {
    urgentOpenCount,
    overdueCount,
    alertsCreated,
  };
}

/**
 * 単一チケットの滞留チェック（将来拡張用）
 * 例：同一チケットが3日以上動いていない場合にアラート
 */
export function checkTicketStale(ticketId: string): boolean {
  // TODO: 実装予定
  return false;
}
