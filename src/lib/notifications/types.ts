/**
 * 通知ドメイン型定義
 *
 * PROD-003: リポジトリ抽象化
 */

import type { NotificationType, Notification as NotificationType_ } from '@/types/notification';

// ========== 基本型 ==========

export type NotificationStatus = 'unread' | 'read' | 'dismissed';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  url: string | null;
  status: NotificationStatus;
  fingerprint: string;
  metadata?: NotificationType_['metadata'];
  createdAt: string;
  readAt: string | null;
}

// ========== リクエスト型 ==========

export interface CreateNotificationRequest {
  tenantId: string;
  userId: string;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  url?: string | null;
  fingerprint: string;
  metadata?: NotificationType_['metadata'];
}

export interface ListNotificationsOptions {
  status?: NotificationStatus | 'all';
  type?: NotificationType;
  limit?: number;
  offset?: number;
}

// ========== レスポンス型 ==========

export interface ListNotificationsResult {
  items: Notification[];
  total: number;
  unreadCount: number;
}

export interface CreateNotificationResult {
  notification: Notification;
  isNew: boolean;
}

export type MarkReadResult = {
  success: true;
  notification: Notification;
} | {
  success: false;
  error: string;
}

// ========== リポジトリインターフェース ==========

export interface NotificationRepository {
  // 作成
  create(request: CreateNotificationRequest): CreateNotificationResult;
  createMany(requests: CreateNotificationRequest[]): { notifications: Notification[]; newCount: number };

  // 一覧取得
  listByUser(userId: string, options?: ListNotificationsOptions): ListNotificationsResult;
  listByRole(role: string, options?: ListNotificationsOptions): ListNotificationsResult;

  // 未読件数
  getUnreadCount(userId: string): number;
  getUnreadCountByRole(role: string): number;

  // 既読操作
  markRead(id: string, userId: string): MarkReadResult;
  markAllRead(userId: string): { count: number };
  markAllReadByRole(role: string): { count: number };

  // 却下
  dismiss(id: string, userId: string): { success: true } | { success: false; error: string };

  // 取得（単一）
  getById(id: string): Notification | null;
  getByFingerprint(userId: string, fingerprint: string): Notification | null;

  // 管理用
  listAll(limit?: number): Notification[];
  getStats(): { total: number; unread: number; read: number; dismissed: number };
}

// ========== ダイジェストキュー ==========

export interface DigestQueueItem {
  id: string;
  alertType: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  url: string | null;
  fingerprint: string;
  targetRoles: string[];
  queuedAt: string;
  metadata?: Record<string, unknown>;
}
