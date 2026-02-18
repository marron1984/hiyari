/**
 * 朝イチダイジェスト生成モジュール
 *
 * Implementation Ticket 067: ダイジェストの内容固定（朝イチ）
 *
 * 含める内容:
 * - critical open
 * - system_error open
 * - unclassified open
 * - 期限超過（licenses/contracts/agreements）
 * - 未割当（unassigned_item）
 * - 今日のTop3（059）への導線
 */

import type { AlertSeverity } from '@/lib/alerts/types';
import { listAlerts, getAlertStats } from '@/lib/alerts/repo';
import { getOverdueTickets, listTickets } from '@/lib/tickets/repo';
import type { ViewerContext } from '@/lib/tickets/types';
import { scanExpired as scanExpiredLicenses } from '@/lib/licenses/repo';
import { scanExpiredConsents } from '@/lib/agreements/repo';
import { getUnassignedQueueStats } from '@/lib/assignment/autoAssign';
import { MORNING_DIGEST_ITEMS, DIGEST_ALERT_TYPES } from '@/config/opsSchedule';

// ========== ダイジェスト項目型 ==========

export interface DigestItem {
  type: 'alert' | 'deadline' | 'unassigned' | 'link';
  category: string;
  title: string;
  count: number;
  severity: AlertSeverity;
  href?: string;
}

export interface MorningDigest {
  date: string;
  generatedAt: string;
  items: DigestItem[];
  totalCount: number;
  criticalCount: number;
  summary: string;
  aiVpTop3Url: string;
}

// ========== ダイジェスト生成 ==========

/**
 * 朝イチダイジェストを生成
 */
export function buildMorningDigest(): MorningDigest {
  const items: DigestItem[] = [];
  const now = new Date();
  const date = now.toISOString().split('T')[0];

  // ========== Critical Open アラート ==========
  if (MORNING_DIGEST_ITEMS.criticalOpen) {
    // 実際のアラートリポジトリから取得（モック）
    const criticalAlerts = getCriticalOpenAlerts();
    if (criticalAlerts.count > 0) {
      items.push({
        type: 'alert',
        category: 'critical',
        title: '重大アラート（未対応）',
        count: criticalAlerts.count,
        severity: 'critical',
        href: '/dashboard/alerts?severity=critical&status=open',
      });
    }
  }

  // ========== System Error Open ==========
  if (MORNING_DIGEST_ITEMS.systemErrorOpen) {
    const systemErrors = getSystemErrorAlerts();
    if (systemErrors.count > 0) {
      items.push({
        type: 'alert',
        category: 'system_error',
        title: 'システムエラー（未対応）',
        count: systemErrors.count,
        severity: 'critical',
        href: '/dashboard/alerts?type=system_error&status=open',
      });
    }
  }

  // ========== Unclassified Open ==========
  if (MORNING_DIGEST_ITEMS.unclassifiedOpen) {
    const unclassified = getUnclassifiedAlerts();
    if (unclassified.count > 0) {
      items.push({
        type: 'alert',
        category: 'unclassified',
        title: '未分類スコープ',
        count: unclassified.count,
        severity: 'warning',
        href: '/dashboard/admin/unclassified',
      });
    }
  }

  // ========== 期限超過（licenses/contracts/agreements） ==========
  if (MORNING_DIGEST_ITEMS.deadlineOverdue) {
    const deadlines = getOverdueDeadlines();

    if (deadlines.licenses > 0) {
      items.push({
        type: 'deadline',
        category: 'licenses',
        title: '資格期限超過',
        count: deadlines.licenses,
        severity: deadlines.licenses >= 3 ? 'critical' : 'warning',
        href: '/dashboard/licenses?filter=overdue',
      });
    }

    if (deadlines.agreements > 0) {
      items.push({
        type: 'deadline',
        category: 'agreements',
        title: '同意書期限超過',
        count: deadlines.agreements,
        severity: 'warning',
        href: '/dashboard/agreements?filter=expired',
      });
    }

    if (deadlines.tickets > 0) {
      items.push({
        type: 'deadline',
        category: 'tickets',
        title: 'チケット期限超過',
        count: deadlines.tickets,
        severity: deadlines.tickets >= 5 ? 'critical' : 'warning',
        href: '/dashboard/tickets?filter=overdue',
      });
    }
  }

  // ========== 未割当（unassigned_item） ==========
  if (MORNING_DIGEST_ITEMS.unassignedItems) {
    const unassigned = getUnassignedItems();
    if (unassigned.count > 0) {
      items.push({
        type: 'unassigned',
        category: 'unassigned',
        title: '担当者未割当',
        count: unassigned.count,
        severity: 'warning',
        href: '/dashboard/tickets?filter=unassigned',
      });
    }
  }

  // ========== AI副社長 Top3 への導線 ==========
  if (MORNING_DIGEST_ITEMS.aiVpTop3Link) {
    items.push({
      type: 'link',
      category: 'ai_vp_top3',
      title: '今日のTop3（AI副社長）',
      count: 3,
      severity: 'info',
      href: '/dashboard/ai-vp/top3',
    });
  }

  // ========== サマリー生成 ==========
  const totalCount = items.reduce((sum, item) => sum + (item.type !== 'link' ? item.count : 0), 0);
  const criticalCount = items.filter((item) => item.severity === 'critical').reduce((sum, item) => sum + item.count, 0);

  let summary = '';
  if (criticalCount > 0) {
    summary = `重大${criticalCount}件を含む${totalCount}件の対応事項があります`;
  } else if (totalCount > 0) {
    summary = `${totalCount}件の対応事項があります`;
  } else {
    summary = '対応事項はありません';
  }

  return {
    date,
    generatedAt: now.toISOString(),
    items,
    totalCount,
    criticalCount,
    summary,
    aiVpTop3Url: '/dashboard/ai-vp/top3',
  };
}

// ========== データ取得ヘルパー ==========

const SYSTEM_VIEWER: ViewerContext = { userId: 'system', role: 'admin' };

/**
 * Critical Open アラート数を取得
 */
function getCriticalOpenAlerts(): { count: number } {
  const stats = getAlertStats();
  return { count: stats.criticalOpen };
}

/**
 * System Error アラート数を取得
 */
function getSystemErrorAlerts(): { count: number } {
  const { alerts } = listAlerts({ status: 'open', type: 'system_error' });
  return { count: alerts.length };
}

/**
 * 未分類アラート数を取得
 */
function getUnclassifiedAlerts(): { count: number } {
  const stats = getAlertStats();
  const count =
    (stats.byType.business_scope_unclassified || 0) +
    (stats.byType.unclassified_scope || 0);
  return { count };
}

/**
 * 期限超過カウントを取得
 */
function getOverdueDeadlines(): {
  licenses: number;
  agreements: number;
  tickets: number;
} {
  const expiredLicenses = scanExpiredLicenses();
  const expiredConsents = scanExpiredConsents();
  const overdueTickets = getOverdueTickets();

  return {
    licenses: expiredLicenses.length,
    agreements: expiredConsents.length,
    tickets: overdueTickets.length,
  };
}

/**
 * 未割当アイテム数を取得
 */
function getUnassignedItems(): { count: number } {
  const stats = getUnassignedQueueStats();
  return { count: stats.total };
}

// ========== 通知テキスト生成 ==========

/**
 * ダイジェスト通知のテキストを生成
 */
export function formatDigestNotification(digest: MorningDigest): {
  title: string;
  message: string;
} {
  const title = `朝イチダイジェスト（${digest.date}）`;

  const lines: string[] = [digest.summary];

  for (const item of digest.items) {
    if (item.type === 'link') continue;
    const icon = item.severity === 'critical' ? '🔴' : item.severity === 'warning' ? '🟡' : '🔵';
    lines.push(`${icon} ${item.title}: ${item.count}件`);
  }

  if (digest.items.some((item) => item.type === 'link')) {
    lines.push('');
    lines.push('👉 今日のTop3はこちら: ' + digest.aiVpTop3Url);
  }

  return {
    title,
    message: lines.join('\n'),
  };
}
