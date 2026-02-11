/**
 * 既読レシート Firestoreリポジトリ
 *
 * コレクション: read_receipts
 * ドキュメントID: {userId}:{entityType}:{entityId}
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  ReadReceipt,
  EntityType,
  ReadStats,
} from './types';

const COLLECTION = 'read_receipts';

function makeDocId(userId: string, entityType: EntityType, entityId: string): string {
  return `${userId}:${entityType}:${entityId}`;
}

function now(): string {
  return new Date().toISOString();
}

function docToReadReceipt(doc: FirebaseFirestore.DocumentSnapshot): ReadReceipt {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    userId: d.userId,
    entityType: d.entityType,
    entityId: d.entityId,
    readAt: d.readAt,
    createdAt: d.createdAt,
  };
}

/**
 * 既読をマーク（upsert）
 */
export async function markRead(
  userId: string,
  entityType: EntityType,
  entityId: string,
  readAt?: string
): Promise<ReadReceipt> {
  const db = getAdminDb();
  const docId = makeDocId(userId, entityType, entityId);
  const docRef = db.collection(COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    // 既存の場合は更新しない（最初の既読を保持）
    return docToReadReceipt(existing);
  }

  const timestamp = readAt ?? now();
  const receipt: ReadReceipt = {
    id: docId,
    userId,
    entityType,
    entityId,
    readAt: timestamp,
    createdAt: timestamp,
  };

  await docRef.set(receipt);
  return receipt;
}

/**
 * 既読かどうかを確認
 */
export async function isRead(
  userId: string,
  entityType: EntityType,
  entityId: string
): Promise<boolean> {
  const db = getAdminDb();
  const docId = makeDocId(userId, entityType, entityId);
  const doc = await db.collection(COLLECTION).doc(docId).get();
  return doc.exists;
}

/**
 * 複数エンティティの既読IDを取得
 */
export async function listReadIds(
  userId: string,
  entityType: EntityType,
  entityIds: string[]
): Promise<Set<string>> {
  const readIds = new Set<string>();
  if (entityIds.length === 0) return readIds;

  const db = getAdminDb();

  // Firestore IN query supports max 30 items, so batch if needed
  const batchSize = 30;
  for (let i = 0; i < entityIds.length; i += batchSize) {
    const batch = entityIds.slice(i, i + batchSize);
    const snap = await db
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .where('entityType', '==', entityType)
      .where('entityId', 'in', batch)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      readIds.add(data.entityId);
    }
  }

  return readIds;
}

/**
 * エンティティの既読数をカウント
 */
export async function countReadsForEntity(
  entityType: EntityType,
  entityId: string
): Promise<number> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTION)
    .where('entityType', '==', entityType)
    .where('entityId', '==', entityId)
    .get();

  return snap.size;
}

/**
 * エンティティの未読ユーザーを取得
 * targetUserIds: 対象ユーザーID一覧
 */
export async function listUnreadUserIds(
  entityType: EntityType,
  entityId: string,
  targetUserIds: string[]
): Promise<string[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTION)
    .where('entityType', '==', entityType)
    .where('entityId', '==', entityId)
    .get();

  const readUserIds = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data();
    readUserIds.add(data.userId);
  }

  return targetUserIds.filter((userId) => !readUserIds.has(userId));
}

/**
 * 既読統計を取得
 */
export async function getReadStats(
  entityType: EntityType,
  entityId: string,
  targetUserIds: string[]
): Promise<ReadStats> {
  const targetCount = targetUserIds.length;
  const readCount = await countReadsForEntity(entityType, entityId);
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
export async function listUnreadEntityIds(
  userId: string,
  entityType: EntityType,
  entityIds: string[]
): Promise<string[]> {
  const readIds = await listReadIds(userId, entityType, entityIds);
  return entityIds.filter((entityId) => !readIds.has(entityId));
}

/**
 * ユーザーの未読件数を取得
 */
export async function countUnread(
  userId: string,
  entityType: EntityType,
  entityIds: string[]
): Promise<number> {
  const unreadIds = await listUnreadEntityIds(userId, entityType, entityIds);
  return unreadIds.length;
}

/**
 * 一括既読化
 */
export async function markAllRead(
  userId: string,
  entityType: EntityType,
  entityIds: string[]
): Promise<number> {
  const db = getAdminDb();
  let count = 0;
  const timestamp = now();

  const batch = db.batch();
  const toCreate: { docRef: FirebaseFirestore.DocumentReference; receipt: ReadReceipt }[] = [];

  for (const entityId of entityIds) {
    const docId = makeDocId(userId, entityType, entityId);
    const docRef = db.collection(COLLECTION).doc(docId);
    const existing = await docRef.get();

    if (!existing.exists) {
      const receipt: ReadReceipt = {
        id: docId,
        userId,
        entityType,
        entityId,
        readAt: timestamp,
        createdAt: timestamp,
      };
      toCreate.push({ docRef, receipt });
      count++;
    }
  }

  // Use batched writes (max 500 per batch)
  for (let i = 0; i < toCreate.length; i += 500) {
    const batchItems = toCreate.slice(i, i + 500);
    const writeBatch = db.batch();
    for (const { docRef, receipt } of batchItems) {
      writeBatch.set(docRef, receipt);
    }
    await writeBatch.commit();
  }

  return count;
}

/**
 * ユーザーの既読一覧を取得
 */
export async function listUserReadReceipts(
  userId: string,
  entityType?: EntityType
): Promise<ReadReceipt[]> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db
    .collection(COLLECTION)
    .where('userId', '==', userId);

  if (entityType) {
    q = q.where('entityType', '==', entityType);
  }

  const snap = await q.get();
  const receipts = snap.docs.map(docToReadReceipt);

  // 既読日時で降順ソート
  receipts.sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime());

  return receipts;
}

/**
 * デモ用：既読データを初期化（Firestore版ではno-op、データはシード時に投入）
 */
export async function initializeDemoReadReceipts(): Promise<void> {
  // Firestore版ではno-op
  // 必要に応じてシードスクリプトで投入
}
