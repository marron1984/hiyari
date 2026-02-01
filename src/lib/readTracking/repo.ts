/**
 * 既読レシートリポジトリ
 *
 * インメモリストレージ（本番ではFirestoreに置き換え）
 */

import type {
  ReadReceipt,
  EntityType,
  ReadStats,
  UnreadUser,
  ReadStatsWithUnreadUsers,
} from './types';

// インメモリストレージ
// Key: `${userId}:${entityType}:${entityId}`
const receiptsStore = new Map<string, ReadReceipt>();

// ID生成
let idCounter = 1;

function generateId(): string {
  return `read_${Date.now()}_${idCounter++}`;
}

function makeKey(userId: string, entityType: EntityType, entityId: string): string {
  return `${userId}:${entityType}:${entityId}`;
}

/**
 * 既読をマーク（upsert）
 */
export function markRead(
  userId: string,
  entityType: EntityType,
  entityId: string,
  readAt?: string
): ReadReceipt {
  const key = makeKey(userId, entityType, entityId);
  const existing = receiptsStore.get(key);

  if (existing) {
    // 既存の場合は更新しない（最初の既読を保持）
    return existing;
  }

  const now = readAt ?? new Date().toISOString();
  const receipt: ReadReceipt = {
    id: generateId(),
    userId,
    entityType,
    entityId,
    readAt: now,
    createdAt: now,
  };

  receiptsStore.set(key, receipt);
  return receipt;
}

/**
 * 既読かどうかを確認
 */
export function isRead(
  userId: string,
  entityType: EntityType,
  entityId: string
): boolean {
  const key = makeKey(userId, entityType, entityId);
  return receiptsStore.has(key);
}

/**
 * 複数エンティティの既読IDを取得
 */
export function listReadIds(
  userId: string,
  entityType: EntityType,
  entityIds: string[]
): Set<string> {
  const readIds = new Set<string>();

  for (const entityId of entityIds) {
    if (isRead(userId, entityType, entityId)) {
      readIds.add(entityId);
    }
  }

  return readIds;
}

/**
 * エンティティの既読数をカウント
 */
export function countReadsForEntity(
  entityType: EntityType,
  entityId: string
): number {
  let count = 0;

  for (const receipt of receiptsStore.values()) {
    if (receipt.entityType === entityType && receipt.entityId === entityId) {
      count++;
    }
  }

  return count;
}

/**
 * エンティティの未読ユーザーを取得
 * targetUserIds: 対象ユーザーID一覧
 */
export function listUnreadUserIds(
  entityType: EntityType,
  entityId: string,
  targetUserIds: string[]
): string[] {
  const readUserIds = new Set<string>();

  for (const receipt of receiptsStore.values()) {
    if (receipt.entityType === entityType && receipt.entityId === entityId) {
      readUserIds.add(receipt.userId);
    }
  }

  return targetUserIds.filter((userId) => !readUserIds.has(userId));
}

/**
 * 既読統計を取得
 */
export function getReadStats(
  entityType: EntityType,
  entityId: string,
  targetUserIds: string[]
): ReadStats {
  const targetCount = targetUserIds.length;
  const readCount = countReadsForEntity(entityType, entityId);
  const unreadCount = Math.max(0, targetCount - readCount);
  const readRate = targetCount > 0 ? Math.round((readCount / targetCount) * 100) : 0;

  return {
    entityId,
    targetCount,
    readCount,
    unreadCount,
    readRate,
  };
}

/**
 * ユーザーの未読エンティティIDを取得
 */
export function listUnreadEntityIds(
  userId: string,
  entityType: EntityType,
  entityIds: string[]
): string[] {
  return entityIds.filter((entityId) => !isRead(userId, entityType, entityId));
}

/**
 * ユーザーの未読件数を取得
 */
export function countUnread(
  userId: string,
  entityType: EntityType,
  entityIds: string[]
): number {
  return listUnreadEntityIds(userId, entityType, entityIds).length;
}

/**
 * 一括既読化
 */
export function markAllRead(
  userId: string,
  entityType: EntityType,
  entityIds: string[]
): number {
  let count = 0;
  const now = new Date().toISOString();

  for (const entityId of entityIds) {
    const key = makeKey(userId, entityType, entityId);
    if (!receiptsStore.has(key)) {
      const receipt: ReadReceipt = {
        id: generateId(),
        userId,
        entityType,
        entityId,
        readAt: now,
        createdAt: now,
      };
      receiptsStore.set(key, receipt);
      count++;
    }
  }

  return count;
}

/**
 * ユーザーの既読一覧を取得
 */
export function listUserReadReceipts(
  userId: string,
  entityType?: EntityType
): ReadReceipt[] {
  const receipts: ReadReceipt[] = [];

  for (const receipt of receiptsStore.values()) {
    if (receipt.userId === userId) {
      if (!entityType || receipt.entityType === entityType) {
        receipts.push(receipt);
      }
    }
  }

  // 既読日時で降順ソート
  receipts.sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime());

  return receipts;
}

/**
 * ストアをクリア（テスト用）
 */
export function clearReadReceiptsStore(): void {
  receiptsStore.clear();
  idCounter = 1;
}

/**
 * デモ用：既読データを初期化
 */
export function initializeDemoReadReceipts(): void {
  // user_001 (admin) は全部読んでいる
  markRead('user_001', 'announcement', 'ann_001');
  markRead('user_001', 'announcement', 'ann_002');
  markRead('user_001', 'announcement', 'ann_003');
  markRead('user_001', 'announcement', 'ann_004');
  markRead('user_001', 'announcement', 'ann_005');

  // user_002 (executive) は一部読んでいる
  markRead('user_002', 'announcement', 'ann_001');
  markRead('user_002', 'announcement', 'ann_003');

  // user_003 (manager) は最新のみ
  markRead('user_003', 'announcement', 'ann_001');

  // user_004 (leader) は一部
  markRead('user_004', 'announcement', 'ann_002');
  markRead('user_004', 'announcement', 'ann_004');

  // user_005, user_006, user_007 (staff) はほとんど未読
  markRead('user_005', 'announcement', 'ann_001');
}
