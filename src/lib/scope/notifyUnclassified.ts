/**
 * Unclassified Scope Notification
 *
 * Implementation Ticket 033: 未分類ガードレールと監視アラート
 * 未分類レコードが検出された場合に管理者に通知を送信する
 */

import type { UnclassifiedCounts } from './types';
import type { CreateNotificationInput, NotificationType } from '@/types/notification';
import { getUnclassifiedCounts, getDetectionSummaryMessage } from './detectUnclassifiedBusinessUnit';

/**
 * Create notification input for unclassified scope alert
 */
export function createUnclassifiedNotificationInput(
  tenantId: string,
  userId: string,
  counts: UnclassifiedCounts
): CreateNotificationInput {
  const summary = getDetectionSummaryMessage(counts);

  return {
    tenantId,
    userId,
    type: 'unclassified_scope' as NotificationType,
    title: '未分類レコードの検出',
    message: `${summary}。Scope Backfill を使用して事業単位を割り当ててください。`,
    actionUrl: '/dashboard/admin/scope-backfill',
    metadata: {
      unclassifiedCounts: counts,
    },
  };
}

/**
 * Create notifications for all admins about unclassified records
 *
 * @param tenantId - The tenant ID
 * @param adminUserIds - List of admin user IDs to notify
 * @returns Array of notification inputs (empty if no unclassified records)
 */
export function createUnclassifiedNotifications(
  tenantId: string,
  adminUserIds: string[]
): CreateNotificationInput[] {
  const counts = getUnclassifiedCounts();

  if (counts.total === 0) {
    return [];
  }

  return adminUserIds.map((userId) =>
    createUnclassifiedNotificationInput(tenantId, userId, counts)
  );
}

/**
 * Check if unclassified notification should be sent
 * (based on threshold - only send if total exceeds minimum)
 */
export function shouldSendUnclassifiedNotification(counts: UnclassifiedCounts, threshold: number = 1): boolean {
  return counts.total >= threshold;
}

/**
 * Get notification priority based on unclassified count
 */
export function getNotificationPriority(counts: UnclassifiedCounts): 'normal' | 'high' | 'critical' {
  if (counts.total >= 20) return 'critical';
  if (counts.total >= 5) return 'high';
  return 'normal';
}
