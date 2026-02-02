/**
 * 通知リポジトリ（インメモリ）
 *
 * Task 033: 未分類スコープ通知対応
 */

import type { NotificationType, CreateNotificationInput, Notification as NotificationType_ } from '@/types/notification';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: NotificationType_['metadata'];
  read: boolean;
  createdAt: string;
}

// インメモリストア
const notificationStore = new Map<string, Notification>();
let idCounter = 1;

function generateId(): string {
  return `notif_${Date.now()}_${idCounter++}`;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * 通知を作成
 */
export function createNotification(input: CreateNotificationInput): Notification {
  const notification: Notification = {
    id: generateId(),
    tenantId: input.tenantId,
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    actionUrl: input.actionUrl,
    metadata: input.metadata,
    read: false,
    createdAt: now(),
  };

  notificationStore.set(notification.id, notification);
  return notification;
}

/**
 * 複数通知を一括作成
 */
export function createNotifications(inputs: CreateNotificationInput[]): Notification[] {
  return inputs.map(createNotification);
}

/**
 * ユーザーの通知を取得
 */
export function listNotifications(
  userId: string,
  filter?: { status?: 'read' | 'unread' | 'all'; limit?: number }
): { items: Notification[]; total: number; unreadCount: number } {
  let items = Array.from(notificationStore.values())
    .filter((n) => n.userId === userId);

  // ステータスフィルタ
  if (filter?.status === 'read') {
    items = items.filter((n) => n.read);
  } else if (filter?.status === 'unread') {
    items = items.filter((n) => !n.read);
  }

  // 日付降順ソート
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = items.length;
  const unreadCount = items.filter((n) => !n.read).length;

  // リミット
  if (filter?.limit) {
    items = items.slice(0, filter.limit);
  }

  return { items, total, unreadCount };
}

/**
 * ロール別の通知を取得（admin/manager向け）
 */
export function listNotificationsByRole(
  role: string,
  filter?: { status?: 'read' | 'unread' | 'all'; limit?: number }
): { items: Notification[]; total: number; unreadCount: number } {
  // ロールベースの通知（metadata.targetRole で判定）
  let items = Array.from(notificationStore.values())
    .filter((n) => {
      const targetRole = n.metadata?.targetRole as string | undefined;
      return !targetRole || targetRole === role ||
             (targetRole === 'admin' && ['admin', 'executive'].includes(role)) ||
             (targetRole === 'manager' && ['manager', 'admin', 'executive'].includes(role));
    });

  // ステータスフィルタ
  if (filter?.status === 'read') {
    items = items.filter((n) => n.read);
  } else if (filter?.status === 'unread') {
    items = items.filter((n) => !n.read);
  }

  // 日付降順ソート
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = items.length;
  const unreadCount = items.filter((n) => !n.read).length;

  // リミット
  if (filter?.limit) {
    items = items.slice(0, filter.limit);
  }

  return { items, total, unreadCount };
}

/**
 * 通知を既読にする
 */
export function markAsRead(id: string): boolean {
  const notification = notificationStore.get(id);
  if (!notification) return false;

  notification.read = true;
  return true;
}

/**
 * 全通知を既読にする
 */
export function markAllAsRead(userId: string): number {
  let count = 0;
  for (const notification of notificationStore.values()) {
    if (notification.userId === userId && !notification.read) {
      notification.read = true;
      count++;
    }
  }
  return count;
}

/**
 * 未読件数を取得
 */
export function getUnreadCount(userId: string): number {
  return Array.from(notificationStore.values())
    .filter((n) => n.userId === userId && !n.read)
    .length;
}

/**
 * 未分類スコープ通知を作成（Task 033）
 */
export function createUnclassifiedScopeNotification(
  counts: { tickets: number; repairs: number; correctiveActions: number; total: number }
): Notification | null {
  if (counts.total === 0) return null;

  const parts: string[] = [];
  if (counts.tickets > 0) parts.push(`チケット ${counts.tickets}件`);
  if (counts.repairs > 0) parts.push(`修繕 ${counts.repairs}件`);
  if (counts.correctiveActions > 0) parts.push(`是正措置 ${counts.correctiveActions}件`);

  return createNotification({
    tenantId: 'default',
    userId: 'user_manager', // manager/admin向け通知
    type: 'unclassified_scope',
    title: '未分類レコードの検出',
    message: `businessUnitId 未設定: ${parts.join('、')}（計 ${counts.total}件）。未分類管理画面で対応してください。`,
    actionUrl: '/dashboard/admin/unclassified',  // Task 034: 新しい未分類管理画面へ誘導
    metadata: {
      targetRole: 'manager', // manager以上に表示
      unclassifiedCounts: counts,
      detectedAt: now(),
    },
  });
}
