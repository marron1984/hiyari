/**
 * 通知リポジトリ - Memory実装
 *
 * PROD-003: In-Memory + JSONファイル永続化
 * 開発/テスト環境用
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  Notification,
  NotificationStatus,
  CreateNotificationRequest,
  CreateNotificationResult,
  ListNotificationsOptions,
  ListNotificationsResult,
  MarkReadResult,
  NotificationRepository,
} from './types';

// ========== ストレージ ==========

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'notifications.json');

let notificationStore = new Map<string, Notification>();
let fingerprintIndex = new Map<string, string>();
let idCounter = 1;
let isInitialized = false;

// ========== 初期化 ==========

function initializeStorage(): void {
  if (isInitialized) return;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

      if (data.notifications && Array.isArray(data.notifications)) {
        for (const n of data.notifications) {
          notificationStore.set(n.id, n);
          const fpKey = buildFingerprintKey(n.userId, n.fingerprint);
          fingerprintIndex.set(fpKey, n.id);
        }
      }

      if (data.idCounter) {
        idCounter = data.idCounter;
      } else {
        const maxId = Math.max(0, ...Array.from(notificationStore.values())
          .map(n => parseInt(n.id.replace(/\D/g, '')) || 0));
        idCounter = maxId + 1;
      }
    }

    isInitialized = true;
    console.log(`[Notifications:Memory] Loaded ${notificationStore.size} notifications`);
  } catch (error) {
    console.error('[Notifications:Memory] Failed to load:', error);
    isInitialized = true;
  }
}

function saveStorage(): void {
  try {
    const data = {
      notifications: Array.from(notificationStore.values()),
      idCounter,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Notifications:Memory] Failed to save:', error);
  }
}

// ========== ユーティリティ ==========

function generateId(): string {
  return `notif_${Date.now()}_${idCounter++}`;
}

function now(): string {
  return new Date().toISOString();
}

function buildFingerprintKey(userId: string, fingerprint: string): string {
  return `${userId}:${fingerprint}`;
}

function matchesRole(notification: Notification, role: string): boolean {
  const targetRole = notification.metadata?.targetRole as string | undefined;
  return !targetRole || targetRole === role ||
    (targetRole === 'admin' && ['admin', 'executive'].includes(role)) ||
    (targetRole === 'manager' && ['manager', 'admin', 'executive'].includes(role)) ||
    (targetRole === 'leader' && ['leader', 'manager', 'admin', 'executive'].includes(role));
}

// ========== リポジトリ実装 ==========

initializeStorage();

export const memoryNotificationRepository: NotificationRepository = {
  create(request: CreateNotificationRequest): CreateNotificationResult {
    const fpKey = buildFingerprintKey(request.userId, request.fingerprint);

    const existingId = fingerprintIndex.get(fpKey);
    if (existingId) {
      const existing = notificationStore.get(existingId);
      if (existing) {
        return { notification: existing, isNew: false };
      }
    }

    const notification: Notification = {
      id: generateId(),
      tenantId: request.tenantId,
      userId: request.userId,
      type: request.type,
      severity: request.severity ?? 'info',
      title: request.title,
      message: request.message,
      url: request.url ?? null,
      status: 'unread',
      fingerprint: request.fingerprint,
      metadata: request.metadata,
      createdAt: now(),
      readAt: null,
    };

    notificationStore.set(notification.id, notification);
    fingerprintIndex.set(fpKey, notification.id);
    saveStorage();

    return { notification, isNew: true };
  },

  createMany(requests: CreateNotificationRequest[]): { notifications: Notification[]; newCount: number } {
    const results = requests.map(r => this.create(r));
    return {
      notifications: results.map(r => r.notification),
      newCount: results.filter(r => r.isNew).length,
    };
  },

  listByUser(userId: string, options?: ListNotificationsOptions): ListNotificationsResult {
    let items = Array.from(notificationStore.values())
      .filter(n => n.userId === userId);

    if (options?.status && options.status !== 'all') {
      items = items.filter(n => n.status === options.status);
    }

    if (options?.type) {
      items = items.filter(n => n.type === options.type);
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = items.length;
    const unreadCount = Array.from(notificationStore.values())
      .filter(n => n.userId === userId && n.status === 'unread').length;

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    items = items.slice(offset, offset + limit);

    return { items, total, unreadCount };
  },

  listByRole(role: string, options?: ListNotificationsOptions): ListNotificationsResult {
    let items = Array.from(notificationStore.values())
      .filter(n => matchesRole(n, role));

    if (options?.status && options.status !== 'all') {
      items = items.filter(n => n.status === options.status);
    }

    if (options?.type) {
      items = items.filter(n => n.type === options.type);
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = items.length;
    const unreadCount = items.filter(n => n.status === 'unread').length;

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    items = items.slice(offset, offset + limit);

    return { items, total, unreadCount };
  },

  getUnreadCount(userId: string): number {
    return Array.from(notificationStore.values())
      .filter(n => n.userId === userId && n.status === 'unread').length;
  },

  getUnreadCountByRole(role: string): number {
    return Array.from(notificationStore.values())
      .filter(n => n.status === 'unread' && matchesRole(n, role)).length;
  },

  markRead(id: string, userId: string): MarkReadResult {
    const notification = notificationStore.get(id);

    if (!notification) {
      return { success: false, error: '通知が見つかりません' };
    }

    if (notification.userId !== userId) {
      const targetRole = notification.metadata?.targetRole as string | undefined;
      if (!targetRole) {
        return { success: false, error: 'この通知を操作する権限がありません' };
      }
    }

    if (notification.status === 'unread') {
      notification.status = 'read';
      notification.readAt = now();
      saveStorage();
    }

    return { success: true, notification };
  },

  markAllRead(userId: string): { count: number } {
    let count = 0;
    const timestamp = now();

    for (const notification of notificationStore.values()) {
      if (notification.userId === userId && notification.status === 'unread') {
        notification.status = 'read';
        notification.readAt = timestamp;
        count++;
      }
    }

    if (count > 0) saveStorage();
    return { count };
  },

  markAllReadByRole(role: string): { count: number } {
    let count = 0;
    const timestamp = now();

    for (const notification of notificationStore.values()) {
      if (notification.status !== 'unread') continue;
      if (matchesRole(notification, role)) {
        notification.status = 'read';
        notification.readAt = timestamp;
        count++;
      }
    }

    if (count > 0) saveStorage();
    return { count };
  },

  dismiss(id: string, userId: string): { success: true } | { success: false; error: string } {
    const notification = notificationStore.get(id);

    if (!notification) {
      return { success: false, error: '通知が見つかりません' };
    }

    if (notification.userId !== userId) {
      const targetRole = notification.metadata?.targetRole as string | undefined;
      if (!targetRole) {
        return { success: false, error: 'この通知を操作する権限がありません' };
      }
    }

    notification.status = 'dismissed';
    saveStorage();
    return { success: true };
  },

  getById(id: string): Notification | null {
    return notificationStore.get(id) ?? null;
  },

  getByFingerprint(userId: string, fingerprint: string): Notification | null {
    const fpKey = buildFingerprintKey(userId, fingerprint);
    const id = fingerprintIndex.get(fpKey);
    if (!id) return null;
    return notificationStore.get(id) ?? null;
  },

  listAll(limit: number = 100): Notification[] {
    return Array.from(notificationStore.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  getStats(): { total: number; unread: number; read: number; dismissed: number } {
    const all = Array.from(notificationStore.values());
    return {
      total: all.length,
      unread: all.filter(n => n.status === 'unread').length,
      read: all.filter(n => n.status === 'read').length,
      dismissed: all.filter(n => n.status === 'dismissed').length,
    };
  },
};
