/**
 * 通知リポジトリ - Firestore実装
 *
 * PROD-003: Cloud Firestore永続化
 * 本番環境用
 *
 * コレクション: notifications
 * ドキュメントID: {userId}__{fingerprint}（冪等性のため）
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  Notification,
  CreateNotificationRequest,
  CreateNotificationResult,
  ListNotificationsOptions,
  ListNotificationsResult,
  MarkReadResult,
  NotificationRepository,
} from './types';

// ========== 定数 ==========

const COLLECTION_NAME = 'notifications';

// ========== ユーティリティ ==========

function buildDocId(userId: string, fingerprint: string): string {
  // Firestore docIdに使えない文字を置換
  const safeUserId = userId.replace(/[\/\.]/g, '_');
  const safeFingerprint = fingerprint.replace(/[\/\.]/g, '_');
  return `${safeUserId}__${safeFingerprint}`;
}

function now(): string {
  return new Date().toISOString();
}

function matchesRole(notification: Notification, role: string): boolean {
  const targetRole = notification.metadata?.targetRole as string | undefined;
  return !targetRole || targetRole === role ||
    (targetRole === 'admin' && ['admin', 'executive'].includes(role)) ||
    (targetRole === 'manager' && ['manager', 'admin', 'executive'].includes(role)) ||
    (targetRole === 'leader' && ['leader', 'manager', 'admin', 'executive'].includes(role));
}

function docToNotification(doc: FirebaseFirestore.DocumentSnapshot): Notification | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: doc.id,
    tenantId: data.tenantId,
    userId: data.userId,
    type: data.type,
    severity: data.severity,
    title: data.title,
    message: data.message,
    url: data.url,
    status: data.status,
    fingerprint: data.fingerprint,
    metadata: data.metadata,
    createdAt: data.createdAt,
    readAt: data.readAt,
  };
}

// ========== リポジトリ実装 ==========

export const firestoreNotificationRepository: NotificationRepository = {
  create(request: CreateNotificationRequest): CreateNotificationResult {
    // 同期APIのため、Firestoreは使えない（非同期が必要）
    // 実際の運用ではcreateAsyncを使用
    throw new Error('Use createAsync for Firestore implementation');
  },

  createMany(requests: CreateNotificationRequest[]): { notifications: Notification[]; newCount: number } {
    throw new Error('Use createManyAsync for Firestore implementation');
  },

  listByUser(userId: string, options?: ListNotificationsOptions): ListNotificationsResult {
    throw new Error('Use listByUserAsync for Firestore implementation');
  },

  listByRole(role: string, options?: ListNotificationsOptions): ListNotificationsResult {
    throw new Error('Use listByRoleAsync for Firestore implementation');
  },

  getUnreadCount(userId: string): number {
    throw new Error('Use getUnreadCountAsync for Firestore implementation');
  },

  getUnreadCountByRole(role: string): number {
    throw new Error('Use getUnreadCountByRoleAsync for Firestore implementation');
  },

  markRead(id: string, userId: string): MarkReadResult {
    throw new Error('Use markReadAsync for Firestore implementation');
  },

  markAllRead(userId: string): { count: number } {
    throw new Error('Use markAllReadAsync for Firestore implementation');
  },

  markAllReadByRole(role: string): { count: number } {
    throw new Error('Use markAllReadByRoleAsync for Firestore implementation');
  },

  dismiss(id: string, userId: string): { success: true } | { success: false; error: string } {
    throw new Error('Use dismissAsync for Firestore implementation');
  },

  getById(id: string): Notification | null {
    throw new Error('Use getByIdAsync for Firestore implementation');
  },

  getByFingerprint(userId: string, fingerprint: string): Notification | null {
    throw new Error('Use getByFingerprintAsync for Firestore implementation');
  },

  listAll(limit?: number): Notification[] {
    throw new Error('Use listAllAsync for Firestore implementation');
  },

  getStats(): { total: number; unread: number; read: number; dismissed: number } {
    throw new Error('Use getStatsAsync for Firestore implementation');
  },
};

// ========== 非同期API ==========

export async function createAsync(request: CreateNotificationRequest): Promise<CreateNotificationResult> {
  try {
    const db = getAdminDb();
    const docId = buildDocId(request.userId, request.fingerprint);
    const docRef = db.collection(COLLECTION_NAME).doc(docId);

    // 既存チェック（冪等性）
    const existingDoc = await docRef.get();
    if (existingDoc.exists) {
      const notification = docToNotification(existingDoc)!;
      return { notification, isNew: false };
    }

    // 新規作成
    const notification: Notification = {
      id: docId,
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

    await docRef.set(notification);
    return { notification, isNew: true };
  } catch (error) {
    console.error('[Notifications:Firestore] Create error:', error);
    throw error;
  }
}

export async function createManyAsync(
  requests: CreateNotificationRequest[]
): Promise<{ notifications: Notification[]; newCount: number }> {
  const results = await Promise.all(requests.map(r => createAsync(r)));
  return {
    notifications: results.map(r => r.notification),
    newCount: results.filter(r => r.isNew).length,
  };
}

export async function listByUserAsync(
  userId: string,
  options?: ListNotificationsOptions
): Promise<ListNotificationsResult> {
  try {
    const db = getAdminDb();
    let query = db.collection(COLLECTION_NAME)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc');

    if (options?.status && options.status !== 'all') {
      query = query.where('status', '==', options.status);
    }

    if (options?.type) {
      query = query.where('type', '==', options.type);
    }

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const snapshot = await query.limit(limit + offset).get();
    const allItems = snapshot.docs.map(doc => docToNotification(doc)!);
    const items = allItems.slice(offset, offset + limit);

    // 未読カウント
    const unreadSnapshot = await db.collection(COLLECTION_NAME)
      .where('userId', '==', userId)
      .where('status', '==', 'unread')
      .count()
      .get();

    return {
      items,
      total: allItems.length,
      unreadCount: unreadSnapshot.data().count,
    };
  } catch (error) {
    console.error('[Notifications:Firestore] listByUser error:', error);
    return { items: [], total: 0, unreadCount: 0 };
  }
}

export async function listByRoleAsync(
  role: string,
  options?: ListNotificationsOptions
): Promise<ListNotificationsResult> {
  try {
    const db = getAdminDb();
    // 注意: Firestoreではmetadata.targetRoleでの複雑なフィルタは難しい
    // 全件取得してメモリでフィルタ（パフォーマンス要改善）
    let query = db.collection(COLLECTION_NAME)
      .orderBy('createdAt', 'desc')
      .limit(500);

    const snapshot = await query.get();
    let items = snapshot.docs
      .map(doc => docToNotification(doc)!)
      .filter(n => matchesRole(n, role));

    if (options?.status && options.status !== 'all') {
      items = items.filter(n => n.status === options.status);
    }

    if (options?.type) {
      items = items.filter(n => n.type === options.type);
    }

    const total = items.length;
    const unreadCount = items.filter(n => n.status === 'unread').length;

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    items = items.slice(offset, offset + limit);

    return { items, total, unreadCount };
  } catch (error) {
    console.error('[Notifications:Firestore] listByRole error:', error);
    return { items: [], total: 0, unreadCount: 0 };
  }
}

export async function getUnreadCountAsync(userId: string): Promise<number> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('userId', '==', userId)
      .where('status', '==', 'unread')
      .count()
      .get();
    return snapshot.data().count;
  } catch (error) {
    console.error('[Notifications:Firestore] getUnreadCount error:', error);
    return 0;
  }
}

export async function getUnreadCountByRoleAsync(role: string): Promise<number> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('status', '==', 'unread')
      .limit(500)
      .get();

    return snapshot.docs
      .map(doc => docToNotification(doc)!)
      .filter(n => matchesRole(n, role))
      .length;
  } catch (error) {
    console.error('[Notifications:Firestore] getUnreadCountByRole error:', error);
    return 0;
  }
}

export async function markReadAsync(
  id: string,
  userId: string
): Promise<MarkReadResult> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION_NAME).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '通知が見つかりません' };
    }

    const notification = docToNotification(doc)!;

    if (notification.userId !== userId) {
      const targetRole = notification.metadata?.targetRole as string | undefined;
      if (!targetRole) {
        return { success: false, error: 'この通知を操作する権限がありません' };
      }
    }

    if (notification.status === 'unread') {
      await docRef.update({
        status: 'read',
        readAt: now(),
      });
      notification.status = 'read';
      notification.readAt = now();
    }

    return { success: true, notification };
  } catch (error) {
    console.error('[Notifications:Firestore] markRead error:', error);
    return { success: false, error: 'Failed to mark as read' };
  }
}

export async function markAllReadAsync(userId: string): Promise<{ count: number }> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('userId', '==', userId)
      .where('status', '==', 'unread')
      .get();

    const batch = db.batch();
    const timestamp = now();

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { status: 'read', readAt: timestamp });
    });

    await batch.commit();
    return { count: snapshot.size };
  } catch (error) {
    console.error('[Notifications:Firestore] markAllRead error:', error);
    return { count: 0 };
  }
}

export async function markAllReadByRoleAsync(role: string): Promise<{ count: number }> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('status', '==', 'unread')
      .limit(500)
      .get();

    const docsToUpdate = snapshot.docs.filter(doc => {
      const n = docToNotification(doc)!;
      return matchesRole(n, role);
    });

    const batch = db.batch();
    const timestamp = now();

    docsToUpdate.forEach(doc => {
      batch.update(doc.ref, { status: 'read', readAt: timestamp });
    });

    await batch.commit();
    return { count: docsToUpdate.length };
  } catch (error) {
    console.error('[Notifications:Firestore] markAllReadByRole error:', error);
    return { count: 0 };
  }
}

export async function dismissAsync(
  id: string,
  userId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION_NAME).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '通知が見つかりません' };
    }

    const notification = docToNotification(doc)!;

    if (notification.userId !== userId) {
      const targetRole = notification.metadata?.targetRole as string | undefined;
      if (!targetRole) {
        return { success: false, error: 'この通知を操作する権限がありません' };
      }
    }

    await docRef.update({ status: 'dismissed' });
    return { success: true };
  } catch (error) {
    console.error('[Notifications:Firestore] dismiss error:', error);
    return { success: false, error: 'Failed to dismiss' };
  }
}

export async function getByIdAsync(id: string): Promise<Notification | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(COLLECTION_NAME).doc(id).get();
    return docToNotification(doc);
  } catch (error) {
    console.error('[Notifications:Firestore] getById error:', error);
    return null;
  }
}

export async function getByFingerprintAsync(
  userId: string,
  fingerprint: string
): Promise<Notification | null> {
  const docId = buildDocId(userId, fingerprint);
  return getByIdAsync(docId);
}

export async function listAllAsync(limit: number = 100): Promise<Notification[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => docToNotification(doc)!);
  } catch (error) {
    console.error('[Notifications:Firestore] listAll error:', error);
    return [];
  }
}

export async function getStatsAsync(): Promise<{
  total: number;
  unread: number;
  read: number;
  dismissed: number;
}> {
  try {
    const db = getAdminDb();

    const [totalSnap, unreadSnap, readSnap, dismissedSnap] = await Promise.all([
      db.collection(COLLECTION_NAME).count().get(),
      db.collection(COLLECTION_NAME).where('status', '==', 'unread').count().get(),
      db.collection(COLLECTION_NAME).where('status', '==', 'read').count().get(),
      db.collection(COLLECTION_NAME).where('status', '==', 'dismissed').count().get(),
    ]);

    return {
      total: totalSnap.data().count,
      unread: unreadSnap.data().count,
      read: readSnap.data().count,
      dismissed: dismissedSnap.data().count,
    };
  } catch (error) {
    console.error('[Notifications:Firestore] getStats error:', error);
    return { total: 0, unread: 0, read: 0, dismissed: 0 };
  }
}
