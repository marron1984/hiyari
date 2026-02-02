/**
 * 通知リポジトリ（DB永続化対応）
 *
 * Implementation Ticket 036: Notifications 永続化（DB化）
 *
 * 本番環境: Firestore/PostgreSQLに置換
 * デモ環境: JSONファイルベース永続化（再起動後も保持）
 *
 * 制約:
 * - UNIQUE(userId, fingerprint) による重複抑制
 * - インデックス: (userId, status, createdAt DESC)
 */

import type { NotificationType, CreateNotificationInput, Notification as NotificationType_ } from '@/types/notification';
import * as fs from 'fs';
import * as path from 'path';
import { NOTIFICATION_TYPE_BUSINESS_SCOPE_UNCLASSIFIED } from '@/lib/alerts/constants';

// ========== 型定義 ==========

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

export interface ListNotificationsResult {
  items: Notification[];
  total: number;
  unreadCount: number;
}

// ========== 永続化ストレージ ==========

// データファイルパス（プロジェクトルートの .data ディレクトリ）
const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'notifications.json');

// インメモリキャッシュ（DBクエリ高速化用）
let notificationStore = new Map<string, Notification>();
// fingerprint インデックス（UNIQUE(userId, fingerprint)の代替）
let fingerprintIndex = new Map<string, string>();

let idCounter = 1;
let isInitialized = false;

/**
 * ストレージを初期化（ファイルから読み込み）
 */
function initializeStorage(): void {
  if (isInitialized) return;

  try {
    // データディレクトリがなければ作成
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // ファイルが存在すれば読み込み
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

      // Map に変換
      if (data.notifications && Array.isArray(data.notifications)) {
        for (const n of data.notifications) {
          notificationStore.set(n.id, n);
          const fpKey = buildFingerprintKey(n.userId, n.fingerprint);
          fingerprintIndex.set(fpKey, n.id);
        }
      }

      // ID カウンタを復元
      if (data.idCounter) {
        idCounter = data.idCounter;
      } else {
        // 既存データから最大IDを取得
        const maxId = Math.max(0, ...Array.from(notificationStore.values())
          .map(n => parseInt(n.id.replace(/\D/g, '')) || 0));
        idCounter = maxId + 1;
      }
    }

    isInitialized = true;
    console.log(`[Notifications] Loaded ${notificationStore.size} notifications from storage`);
  } catch (error) {
    console.error('[Notifications] Failed to load from storage:', error);
    isInitialized = true;  // エラーでも初期化完了扱い
  }
}

/**
 * ストレージに保存（非同期でファイル書き込み）
 */
function saveStorage(): void {
  try {
    const data = {
      notifications: Array.from(notificationStore.values()),
      idCounter,
      savedAt: new Date().toISOString(),
    };

    // 同期書き込み（データ整合性のため）
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Notifications] Failed to save to storage:', error);
  }
}

// 初期化を実行
initializeStorage();

function generateId(): string {
  return `notif_${Date.now()}_${idCounter++}`;
}

function now(): string {
  return new Date().toISOString();
}

function buildFingerprintKey(userId: string, fingerprint: string): string {
  return `${userId}:${fingerprint}`;
}

// ========== 作成（冪等） ==========

/**
 * 通知を作成（fingerprint による重複抑制あり）
 *
 * 同じ userId + fingerprint の組み合わせが既に存在する場合は
 * 新規作成せず既存の通知を返す（冪等）
 */
export function create(request: CreateNotificationRequest): { notification: Notification; isNew: boolean } {
  const fpKey = buildFingerprintKey(request.userId, request.fingerprint);

  // 重複チェック
  const existingId = fingerprintIndex.get(fpKey);
  if (existingId) {
    const existing = notificationStore.get(existingId);
    if (existing) {
      return { notification: existing, isNew: false };
    }
  }

  // 新規作成
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

  // 永続化
  saveStorage();

  return { notification, isNew: true };
}

/**
 * 複数通知を一括作成（各通知で冪等）
 */
export function createMany(requests: CreateNotificationRequest[]): { notifications: Notification[]; newCount: number } {
  const results = requests.map(create);
  return {
    notifications: results.map((r) => r.notification),
    newCount: results.filter((r) => r.isNew).length,
  };
}

// ========== 一覧取得 ==========

/**
 * ユーザーの通知一覧を取得
 */
export function listByUser(
  userId: string,
  options?: ListNotificationsOptions
): ListNotificationsResult {
  let items = Array.from(notificationStore.values())
    .filter((n) => n.userId === userId);

  // ステータスフィルタ
  if (options?.status && options.status !== 'all') {
    items = items.filter((n) => n.status === options.status);
  }

  // タイプフィルタ
  if (options?.type) {
    items = items.filter((n) => n.type === options.type);
  }

  // 日付降順ソート
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = items.length;
  const unreadCount = Array.from(notificationStore.values())
    .filter((n) => n.userId === userId && n.status === 'unread')
    .length;

  // ページネーション
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;
  items = items.slice(offset, offset + limit);

  return { items, total, unreadCount };
}

/**
 * ロール別の通知を取得（admin/manager向け）
 *
 * metadata.targetRole で対象ロールを判定
 */
export function listByRole(
  role: string,
  options?: ListNotificationsOptions
): ListNotificationsResult {
  let items = Array.from(notificationStore.values())
    .filter((n) => {
      const targetRole = n.metadata?.targetRole as string | undefined;
      return !targetRole || targetRole === role ||
             (targetRole === 'admin' && ['admin', 'executive'].includes(role)) ||
             (targetRole === 'manager' && ['manager', 'admin', 'executive'].includes(role)) ||
             (targetRole === 'leader' && ['leader', 'manager', 'admin', 'executive'].includes(role));
    });

  // ステータスフィルタ
  if (options?.status && options.status !== 'all') {
    items = items.filter((n) => n.status === options.status);
  }

  // タイプフィルタ
  if (options?.type) {
    items = items.filter((n) => n.type === options.type);
  }

  // 日付降順ソート
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = items.length;
  const unreadCount = items.filter((n) => n.status === 'unread').length;

  // ページネーション
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;
  items = items.slice(offset, offset + limit);

  return { items, total, unreadCount };
}

// ========== 未読件数 ==========

/**
 * ユーザーの未読件数を取得
 */
export function getUnreadCount(userId: string): number {
  return Array.from(notificationStore.values())
    .filter((n) => n.userId === userId && n.status === 'unread')
    .length;
}

/**
 * ロール別の未読件数を取得
 */
export function getUnreadCountByRole(role: string): number {
  return Array.from(notificationStore.values())
    .filter((n) => {
      if (n.status !== 'unread') return false;
      const targetRole = n.metadata?.targetRole as string | undefined;
      return !targetRole || targetRole === role ||
             (targetRole === 'admin' && ['admin', 'executive'].includes(role)) ||
             (targetRole === 'manager' && ['manager', 'admin', 'executive'].includes(role)) ||
             (targetRole === 'leader' && ['leader', 'manager', 'admin', 'executive'].includes(role));
    })
    .length;
}

// ========== 既読操作 ==========

/**
 * 通知を既読にする
 *
 * @param id 通知ID
 * @param userId ユーザーID（認可チェック用）
 */
export function markRead(
  id: string,
  userId: string
): { success: true; notification: Notification } | { success: false; error: string } {
  const notification = notificationStore.get(id);

  if (!notification) {
    return { success: false, error: '通知が見つかりません' };
  }

  if (notification.userId !== userId) {
    // ロールベース通知の場合はuserIdが異なることがあるので、その場合は許可
    const targetRole = notification.metadata?.targetRole as string | undefined;
    if (!targetRole) {
      return { success: false, error: 'この通知を操作する権限がありません' };
    }
  }

  if (notification.status === 'unread') {
    notification.status = 'read';
    notification.readAt = now();
    // 永続化
    saveStorage();
  }

  return { success: true, notification };
}

/**
 * ユーザーの全未読通知を既読にする
 *
 * @returns 更新された件数
 */
export function markAllRead(userId: string): { count: number } {
  let count = 0;
  const timestamp = now();

  for (const notification of notificationStore.values()) {
    if (notification.userId === userId && notification.status === 'unread') {
      notification.status = 'read';
      notification.readAt = timestamp;
      count++;
    }
  }

  // 永続化（更新があった場合のみ）
  if (count > 0) {
    saveStorage();
  }

  return { count };
}

/**
 * ロール向け通知を一括既読にする
 */
export function markAllReadByRole(role: string): { count: number } {
  let count = 0;
  const timestamp = now();

  for (const notification of notificationStore.values()) {
    if (notification.status !== 'unread') continue;

    const targetRole = notification.metadata?.targetRole as string | undefined;
    const isTarget = !targetRole || targetRole === role ||
      (targetRole === 'admin' && ['admin', 'executive'].includes(role)) ||
      (targetRole === 'manager' && ['manager', 'admin', 'executive'].includes(role)) ||
      (targetRole === 'leader' && ['leader', 'manager', 'admin', 'executive'].includes(role));

    if (isTarget) {
      notification.status = 'read';
      notification.readAt = timestamp;
      count++;
    }
  }

  // 永続化（更新があった場合のみ）
  if (count > 0) {
    saveStorage();
  }

  return { count };
}

// ========== 削除/却下 ==========

/**
 * 通知を却下（非表示）にする
 */
export function dismiss(
  id: string,
  userId: string
): { success: true } | { success: false; error: string } {
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
  // 永続化
  saveStorage();
  return { success: true };
}

// ========== 取得（単一） ==========

/**
 * 通知をIDで取得
 */
export function getById(id: string): Notification | null {
  return notificationStore.get(id) ?? null;
}

/**
 * fingerprint で通知を取得
 */
export function getByFingerprint(userId: string, fingerprint: string): Notification | null {
  const fpKey = buildFingerprintKey(userId, fingerprint);
  const id = fingerprintIndex.get(fpKey);
  if (!id) return null;
  return notificationStore.get(id) ?? null;
}

// ========== ヘルパー関数 ==========

/**
 * fingerprint を生成
 */
export function generateFingerprint(type: string, ...parts: string[]): string {
  return [type, ...parts].join(':');
}

// ========== 互換性のための関数（既存コードとの互換性維持） ==========

/**
 * 通知を作成（旧API互換）
 *
 * @deprecated create() を使用してください
 */
export function createNotification(input: CreateNotificationInput): Notification {
  // fingerprint を自動生成（互換性のため）
  const fingerprint = generateFingerprint(
    input.type,
    input.userId,
    input.title.slice(0, 50),
    new Date().toISOString().slice(0, 10)  // 日付で重複抑制
  );

  const result = create({
    tenantId: input.tenantId,
    userId: input.userId,
    type: input.type,
    severity: 'info',
    title: input.title,
    message: input.message,
    url: input.actionUrl ?? null,
    fingerprint,
    metadata: input.metadata,
  });

  return result.notification;
}

/**
 * 複数通知を一括作成（旧API互換）
 *
 * @deprecated createMany() を使用してください
 */
export function createNotifications(inputs: CreateNotificationInput[]): Notification[] {
  return inputs.map(createNotification);
}

/**
 * ユーザーの通知を取得（旧API互換）
 *
 * @deprecated listByUser() を使用してください
 */
export function listNotifications(
  userId: string,
  filter?: { status?: 'read' | 'unread' | 'all'; limit?: number }
): { items: Notification[]; total: number; unreadCount: number } {
  return listByUser(userId, {
    status: filter?.status === 'read' ? 'read' :
            filter?.status === 'unread' ? 'unread' : 'all',
    limit: filter?.limit,
  });
}

/**
 * ロール別の通知を取得（旧API互換）
 *
 * @deprecated listByRole() を使用してください
 */
export function listNotificationsByRole(
  role: string,
  filter?: { status?: 'read' | 'unread' | 'all'; limit?: number }
): { items: Notification[]; total: number; unreadCount: number } {
  return listByRole(role, {
    status: filter?.status === 'read' ? 'read' :
            filter?.status === 'unread' ? 'unread' : 'all',
    limit: filter?.limit,
  });
}

/**
 * 通知を既読にする（旧API互換）
 *
 * @deprecated markRead() を使用してください
 */
export function markAsRead(id: string): boolean {
  // 旧APIはuserIdチェックなし（互換性のため）
  const notification = notificationStore.get(id);
  if (!notification) return false;

  if (notification.status === 'unread') {
    notification.status = 'read';
    notification.readAt = now();
  }
  return true;
}

// ========== 未分類スコープ通知（Task 033/034） ==========

/**
 * 未分類スコープ通知を作成
 *
 * fingerprint により同日の重複通知を抑制
 */
export function createUnclassifiedScopeNotification(
  counts: { tickets: number; repairs: number; correctiveActions: number; total: number }
): Notification | null {
  if (counts.total === 0) return null;

  const parts: string[] = [];
  if (counts.tickets > 0) parts.push(`チケット ${counts.tickets}件`);
  if (counts.repairs > 0) parts.push(`修繕 ${counts.repairs}件`);
  if (counts.correctiveActions > 0) parts.push(`是正措置 ${counts.correctiveActions}件`);

  // 同日の重複を抑制するfingerprint
  const today = new Date().toISOString().slice(0, 10);
  const fingerprint = generateFingerprint(NOTIFICATION_TYPE_BUSINESS_SCOPE_UNCLASSIFIED, 'summary', today);

  const result = create({
    tenantId: 'default',
    userId: 'user_manager',
    type: NOTIFICATION_TYPE_BUSINESS_SCOPE_UNCLASSIFIED,  // Task 038: 正式名称を使用
    severity: counts.total >= 20 ? 'critical' : counts.total >= 5 ? 'warning' : 'info',
    title: '未分類レコードの検出',
    message: `businessUnitId 未設定: ${parts.join('、')}（計 ${counts.total}件）。未分類管理画面で対応してください。`,
    url: '/dashboard/admin/unclassified',
    fingerprint,
    metadata: {
      targetRole: 'manager',
      unclassifiedCounts: counts,
      detectedAt: now(),
    },
  });

  return result.isNew ? result.notification : null;
}

// ========== デバッグ/管理用 ==========

/**
 * 全通知を取得（管理用）
 */
export function listAll(limit: number = 100): Notification[] {
  return Array.from(notificationStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/**
 * 通知件数を取得（管理用）
 */
export function getStats(): { total: number; unread: number; read: number; dismissed: number } {
  const all = Array.from(notificationStore.values());
  return {
    total: all.length,
    unread: all.filter((n) => n.status === 'unread').length,
    read: all.filter((n) => n.status === 'read').length,
    dismissed: all.filter((n) => n.status === 'dismissed').length,
  };
}
