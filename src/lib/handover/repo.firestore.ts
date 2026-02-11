/**
 * 申し送り（Handover）Firestoreリポジトリ
 *
 * コレクション: handover_items, handover_comments
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  HandoverItem,
  HandoverComment,
  CreateHandoverRequest,
  UpdateHandoverRequest,
  HandoverFilter,
  HandoverListItem,
} from './types';
import { getHandoverTargetUserIds, isUserTargeted } from './getHandoverTargetUserIds';
import { markRead, listReadIds, getReadStats } from '@/lib/readTracking/repo.firestore';
import type { AppRole } from '@/config/appRoles';

const ITEMS_COLLECTION = 'handover_items';
const COMMENTS_COLLECTION = 'handover_comments';

function now(): string {
  return new Date().toISOString();
}

function docToHandoverItem(doc: FirebaseFirestore.DocumentSnapshot): HandoverItem {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    title: d.title,
    body: d.body,
    priority: d.priority,
    status: d.status,
    createdByUserId: d.createdByUserId,
    createdByUserName: d.createdByUserName,
    targetRolesJson: d.targetRolesJson ?? null,
    targetUserIdsJson: d.targetUserIdsJson ?? null,
    dueAt: d.dueAt ?? null,
    shift: d.shift ?? null,
    tagsJson: d.tagsJson ?? null,
    relatedType: d.relatedType ?? null,
    relatedId: d.relatedId ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function docToHandoverComment(doc: FirebaseFirestore.DocumentSnapshot): HandoverComment {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    itemId: d.itemId,
    userId: d.userId,
    userName: d.userName,
    message: d.message,
    createdAt: d.createdAt,
  };
}

// ========================================
// 申し送りアイテム操作
// ========================================

/**
 * 申し送り一覧取得
 */
export async function listHandoverItems(
  filter: HandoverFilter = {},
  userRole: AppRole,
  userId: string
): Promise<{ items: HandoverListItem[]; total: number }> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(ITEMS_COLLECTION);

  // Firestoreフィルタ
  if (filter.status) {
    q = q.where('status', '==', filter.status);
  }
  if (filter.priority) {
    q = q.where('priority', '==', filter.priority);
  }
  if (filter.shift) {
    q = q.where('shift', '==', filter.shift);
  }

  const snap = await q.get();
  let items = snap.docs.map(docToHandoverItem);

  // アクセス制御: 対象ユーザーのみ
  if (!['admin', 'executive', 'manager', 'auditor'].includes(userRole)) {
    items = items.filter((item) => isUserTargeted(item, userId, userRole));
  }

  // メモリ内フィルタ
  if (filter.tag) {
    items = items.filter(
      (item) => item.tagsJson && item.tagsJson.includes(filter.tag!)
    );
  }
  if (filter.q) {
    const search = filter.q.toLowerCase();
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(search) ||
        item.body.toLowerCase().includes(search)
    );
  }
  if (filter.dateFrom) {
    items = items.filter((item) => item.createdAt.slice(0, 10) >= filter.dateFrom!);
  }
  if (filter.dateTo) {
    items = items.filter((item) => item.createdAt.slice(0, 10) <= filter.dateTo!);
  }

  const total = items.length;

  // ソート: createdAt DESC
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  items = items.slice(offset, offset + limit);

  // 既読情報を付加
  const itemIds = items.map((item) => item.id);
  const readIds = await listReadIds(userId, 'handover', itemIds);

  const listItems: HandoverListItem[] = items.map((item) => ({
    ...item,
    isRead: readIds.has(item.id),
    commentCount: 0, // コメント数は後で取得
  }));

  // コメント数を取得
  for (const listItem of listItems) {
    listItem.commentCount = await countComments(listItem.id);
  }

  return { items: listItems, total };
}

/**
 * 未読の申し送り一覧取得
 */
export async function listUnreadHandoverItems(
  userRole: AppRole,
  userId: string,
  limit = 50
): Promise<HandoverListItem[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(ITEMS_COLLECTION)
    .where('status', '==', 'open')
    .get();

  let items = snap.docs.map(docToHandoverItem);

  // アクセス制御
  if (!['admin', 'executive', 'manager', 'auditor'].includes(userRole)) {
    items = items.filter((item) => isUserTargeted(item, userId, userRole));
  }

  // 既読チェック
  const itemIds = items.map((item) => item.id);
  const readIds = await listReadIds(userId, 'handover', itemIds);

  // 未読のみ
  items = items.filter((item) => !readIds.has(item.id));

  // ソート
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // limit
  items = items.slice(0, limit);

  const listItems: HandoverListItem[] = [];
  for (const item of items) {
    const commentCount = await countComments(item.id);
    listItems.push({
      ...item,
      isRead: false,
      commentCount,
    });
  }

  return listItems;
}

/**
 * 未読件数取得
 */
export async function countUnreadHandoverItems(userRole: AppRole, userId: string): Promise<number> {
  const db = getAdminDb();
  const snap = await db
    .collection(ITEMS_COLLECTION)
    .where('status', '==', 'open')
    .get();

  let items = snap.docs.map(docToHandoverItem);

  // アクセス制御
  if (!['admin', 'executive', 'manager', 'auditor'].includes(userRole)) {
    items = items.filter((item) => isUserTargeted(item, userId, userRole));
  }

  // 既読チェック
  const itemIds = items.map((item) => item.id);
  const readIds = await listReadIds(userId, 'handover', itemIds);

  return items.filter((item) => !readIds.has(item.id)).length;
}

/**
 * 申し送り取得
 */
export async function getHandoverItem(itemId: string): Promise<HandoverItem | null> {
  const db = getAdminDb();
  const doc = await db.collection(ITEMS_COLLECTION).doc(itemId).get();
  if (!doc.exists) return null;
  return docToHandoverItem(doc);
}

/**
 * 申し送り作成
 */
export async function createHandoverItem(
  data: CreateHandoverRequest,
  actorUserId: string,
  actorUserName?: string
): Promise<HandoverItem> {
  const db = getAdminDb();
  const docRef = db.collection(ITEMS_COLLECTION).doc();
  const timestamp = now();

  const item: HandoverItem = {
    id: docRef.id,
    title: data.title,
    body: data.body,
    priority: data.priority ?? 'normal',
    status: 'open',
    createdByUserId: actorUserId,
    createdByUserName: actorUserName,
    targetRolesJson: data.targetRoles ?? null,
    targetUserIdsJson: data.targetUserIds ?? null,
    dueAt: data.dueAt ?? null,
    shift: data.shift ?? null,
    tagsJson: data.tags ?? null,
    relatedType: data.relatedType ?? null,
    relatedId: data.relatedId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await docRef.set(item);
  return item;
}

/**
 * 申し送り更新
 */
export async function updateHandoverItem(
  itemId: string,
  data: UpdateHandoverRequest,
  actorUserId: string,
  actorRole: AppRole
): Promise<{ success: boolean; item?: HandoverItem; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(ITEMS_COLLECTION).doc(itemId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  const item = docToHandoverItem(doc);

  // 権限チェック: 作成者 or manager以上
  if (
    item.createdByUserId !== actorUserId &&
    !['admin', 'manager', 'executive'].includes(actorRole)
  ) {
    return { success: false, error: '更新権限がありません' };
  }

  const timestamp = now();
  const updates: Record<string, unknown> = {
    title: data.title ?? item.title,
    body: data.body ?? item.body,
    priority: data.priority ?? item.priority,
    targetRolesJson: data.targetRoles !== undefined ? data.targetRoles : item.targetRolesJson,
    targetUserIdsJson: data.targetUserIds !== undefined ? data.targetUserIds : item.targetUserIdsJson,
    dueAt: data.dueAt !== undefined ? data.dueAt : item.dueAt,
    shift: data.shift !== undefined ? data.shift : item.shift,
    tagsJson: data.tags !== undefined ? data.tags : item.tagsJson,
    updatedAt: timestamp,
  };

  await docRef.update(updates);

  const updatedDoc = await docRef.get();
  const updated = docToHandoverItem(updatedDoc);

  return { success: true, item: updated };
}

/**
 * 申し送り解決
 */
export async function resolveHandoverItem(
  itemId: string,
  actorUserId: string,
  actorRole: AppRole
): Promise<{ success: boolean; item?: HandoverItem; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(ITEMS_COLLECTION).doc(itemId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  const item = docToHandoverItem(doc);

  if (item.status !== 'open') {
    return { success: false, error: 'open状態の申し送りのみ解決可能です' };
  }

  // 権限チェック: leader以上
  if (!['admin', 'executive', 'manager', 'leader'].includes(actorRole)) {
    return { success: false, error: '解決権限がありません' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'resolved',
    updatedAt: timestamp,
  });

  const updatedDoc = await docRef.get();
  const updated = docToHandoverItem(updatedDoc);

  return { success: true, item: updated };
}

/**
 * 申し送り再オープン
 */
export async function reopenHandoverItem(
  itemId: string,
  actorUserId: string,
  actorRole: AppRole
): Promise<{ success: boolean; item?: HandoverItem; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(ITEMS_COLLECTION).doc(itemId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  const item = docToHandoverItem(doc);

  if (item.status !== 'resolved') {
    return { success: false, error: 'resolved状態の申し送りのみ再オープン可能です' };
  }

  // 権限チェック: leader以上
  if (!['admin', 'executive', 'manager', 'leader'].includes(actorRole)) {
    return { success: false, error: '再オープン権限がありません' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'open',
    updatedAt: timestamp,
  });

  const updatedDoc = await docRef.get();
  const updated = docToHandoverItem(updatedDoc);

  return { success: true, item: updated };
}

/**
 * 申し送りアーカイブ
 */
export async function archiveHandoverItem(
  itemId: string,
  actorRole: AppRole
): Promise<{ success: boolean; item?: HandoverItem; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(ITEMS_COLLECTION).doc(itemId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  // 権限チェック: admin/manager のみ
  if (!['admin', 'manager'].includes(actorRole)) {
    return { success: false, error: 'アーカイブ権限がありません' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'archived',
    updatedAt: timestamp,
  });

  const updatedDoc = await docRef.get();
  const updated = docToHandoverItem(updatedDoc);

  return { success: true, item: updated };
}

// ========================================
// コメント操作
// ========================================

/**
 * コメント追加
 */
export async function addHandoverComment(
  itemId: string,
  message: string,
  actorUserId: string,
  actorUserName?: string
): Promise<{ success: boolean; comment?: HandoverComment; error?: string }> {
  const db = getAdminDb();
  const itemDoc = await db.collection(ITEMS_COLLECTION).doc(itemId).get();

  if (!itemDoc.exists) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  const commentRef = db.collection(COMMENTS_COLLECTION).doc();
  const timestamp = now();

  const comment: HandoverComment = {
    id: commentRef.id,
    itemId,
    userId: actorUserId,
    userName: actorUserName,
    message,
    createdAt: timestamp,
  };

  await commentRef.set(comment);

  // 申し送りの更新日時も更新
  await db.collection(ITEMS_COLLECTION).doc(itemId).update({
    updatedAt: timestamp,
  });

  return { success: true, comment };
}

/**
 * コメント一覧取得
 */
export async function listHandoverComments(itemId: string): Promise<HandoverComment[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(COMMENTS_COLLECTION)
    .where('itemId', '==', itemId)
    .orderBy('createdAt', 'asc')
    .get();

  return snap.docs.map(docToHandoverComment);
}

/**
 * コメント数取得
 */
async function countComments(itemId: string): Promise<number> {
  const db = getAdminDb();
  const snap = await db
    .collection(COMMENTS_COLLECTION)
    .where('itemId', '==', itemId)
    .get();

  return snap.size;
}

// ========================================
// 既読統計（manager以上）
// ========================================

/**
 * 既読統計取得
 */
export async function getHandoverReadStats(
  itemId: string
): Promise<{ targetCount: number; readCount: number; unreadCount: number; readRate: number } | null> {
  const db = getAdminDb();
  const doc = await db.collection(ITEMS_COLLECTION).doc(itemId).get();

  if (!doc.exists) {
    return null;
  }

  const item = docToHandoverItem(doc);
  const targetUserIds = getHandoverTargetUserIds(item);
  const stats = await getReadStats('handover', itemId, targetUserIds);

  return {
    targetCount: stats.targetCount,
    readCount: stats.readCount,
    unreadCount: stats.unreadCount,
    readRate: stats.readRate,
  };
}

/**
 * 既読をマーク
 */
export async function markHandoverRead(itemId: string, userId: string): Promise<void> {
  await markRead(userId, 'handover', itemId);
}

// ========================================
// 全申し送りID取得（未読件数計算用）
// ========================================

/**
 * 全open申し送りIDを取得
 */
export async function listOpenHandoverIds(): Promise<string[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(ITEMS_COLLECTION)
    .where('status', '==', 'open')
    .get();

  return snap.docs.map((doc) => doc.id);
}
