/**
 * 申し送り（Handover）リポジトリ
 *
 * インメモリストレージ（本番ではDBに置き換え）
 */

import type {
  HandoverItem,
  HandoverComment,
  CreateHandoverRequest,
  UpdateHandoverRequest,
  HandoverFilter,
  HandoverListItem,
} from './types';
import { getHandoverTargetUserIds, isUserTargeted } from './getHandoverTargetUserIds';
import { markRead, listReadIds, getReadStats } from '@/lib/readTracking/repo';
import type { AppRole } from '@/config/appRoles';

// インメモリストレージ
const itemsStore = new Map<string, HandoverItem>();
const commentsStore = new Map<string, HandoverComment>();

// ID生成
let itemIdCounter = 1;
let commentIdCounter = 1;

function generateItemId(): string {
  return `handover_${String(itemIdCounter++).padStart(5, '0')}`;
}

function generateCommentId(): string {
  return `hc_${String(commentIdCounter++).padStart(6, '0')}`;
}

// 初期化フラグ
let isInitialized = false;

/**
 * デモデータで初期化
 */
function initializeStore(): void {
  if (isInitialized) return;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  // デモ申し送り1: 重要（urgent）
  const item1: HandoverItem = {
    id: generateItemId(),
    title: '【重要】102号室 山田様 服薬変更について',
    body: '本日より服薬内容が変更になりました。朝食後の降圧剤が1錠から2錠に増量されています。必ず確認の上、投薬してください。',
    priority: 'urgent',
    status: 'open',
    createdByUserId: 'user_003',
    createdByUserName: '鈴木花子',
    targetRolesJson: ['staff', 'leader'],
    targetUserIdsJson: null,
    dueAt: now.toISOString(),
    shift: 'day',
    tagsJson: ['服薬', '利用者'],
    relatedType: null,
    relatedId: null,
    createdAt: yesterday.toISOString(),
    updatedAt: yesterday.toISOString(),
  };
  itemsStore.set(item1.id, item1);

  // デモ申し送り2: 通常
  const item2: HandoverItem = {
    id: generateItemId(),
    title: '共有スペースの清掃について',
    body: '本日、3階共有スペースのワックスがけを行います。14時〜16時は通行禁止となりますのでご注意ください。',
    priority: 'normal',
    status: 'open',
    createdByUserId: 'user_004',
    createdByUserName: '高橋一郎',
    targetRolesJson: null,
    targetUserIdsJson: null,
    dueAt: null,
    shift: null,
    tagsJson: ['施設', '清掃'],
    relatedType: null,
    relatedId: null,
    createdAt: twoDaysAgo.toISOString(),
    updatedAt: twoDaysAgo.toISOString(),
  };
  itemsStore.set(item2.id, item2);

  // デモ申し送り3: 解決済み
  const item3: HandoverItem = {
    id: generateItemId(),
    title: '201号室 佐藤様 家族連絡完了',
    body: 'ご家族への月次報告の電話連絡を完了しました。特に変わりなく、次回面会は来週日曜を予定。',
    priority: 'normal',
    status: 'resolved',
    createdByUserId: 'user_005',
    createdByUserName: '伊藤次郎',
    targetRolesJson: ['staff', 'leader', 'manager'],
    targetUserIdsJson: null,
    dueAt: null,
    shift: 'evening',
    tagsJson: ['家族連絡'],
    relatedType: null,
    relatedId: null,
    createdAt: twoDaysAgo.toISOString(),
    updatedAt: yesterday.toISOString(),
  };
  itemsStore.set(item3.id, item3);

  // デモコメント
  const comment1: HandoverComment = {
    id: generateCommentId(),
    itemId: item1.id,
    userId: 'user_004',
    userName: '高橋一郎',
    message: '日勤帯で確認しました。夜勤への引き継ぎもお願いします。',
    createdAt: now.toISOString(),
  };
  commentsStore.set(comment1.id, comment1);

  isInitialized = true;
}

// ========================================
// 申し送りアイテム操作
// ========================================

/**
 * 申し送り一覧取得
 */
export function listHandoverItems(
  filter: HandoverFilter = {},
  userRole: AppRole,
  userId: string
): { items: HandoverListItem[]; total: number } {
  initializeStore();

  let items = Array.from(itemsStore.values());

  // アクセス制御: 対象ユーザーのみ
  if (!['admin', 'executive', 'manager', 'auditor'].includes(userRole)) {
    items = items.filter((item) => isUserTargeted(item, userId, userRole));
  }

  // フィルタ: status
  if (filter.status) {
    items = items.filter((item) => item.status === filter.status);
  }

  // フィルタ: priority
  if (filter.priority) {
    items = items.filter((item) => item.priority === filter.priority);
  }

  // フィルタ: shift
  if (filter.shift) {
    items = items.filter((item) => item.shift === filter.shift);
  }

  // フィルタ: tag
  if (filter.tag) {
    items = items.filter(
      (item) => item.tagsJson && item.tagsJson.includes(filter.tag!)
    );
  }

  // フィルタ: q (検索)
  if (filter.q) {
    const q = filter.q.toLowerCase();
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q)
    );
  }

  // フィルタ: dateFrom
  if (filter.dateFrom) {
    items = items.filter((item) => item.createdAt.slice(0, 10) >= filter.dateFrom!);
  }

  // フィルタ: dateTo
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
  const readIds = listReadIds(userId, 'handover', itemIds);

  const listItems: HandoverListItem[] = items.map((item) => ({
    ...item,
    isRead: readIds.has(item.id),
    commentCount: countComments(item.id),
  }));

  return { items: listItems, total };
}

/**
 * 未読の申し送り一覧取得
 */
export function listUnreadHandoverItems(
  userRole: AppRole,
  userId: string,
  limit = 50
): HandoverListItem[] {
  initializeStore();

  let items = Array.from(itemsStore.values());

  // アクセス制御
  if (!['admin', 'executive', 'manager', 'auditor'].includes(userRole)) {
    items = items.filter((item) => isUserTargeted(item, userId, userRole));
  }

  // openのみ
  items = items.filter((item) => item.status === 'open');

  // 既読チェック
  const itemIds = items.map((item) => item.id);
  const readIds = listReadIds(userId, 'handover', itemIds);

  // 未読のみ
  items = items.filter((item) => !readIds.has(item.id));

  // ソート
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // limit
  items = items.slice(0, limit);

  return items.map((item) => ({
    ...item,
    isRead: false,
    commentCount: countComments(item.id),
  }));
}

/**
 * 未読件数取得
 */
export function countUnreadHandoverItems(userRole: AppRole, userId: string): number {
  initializeStore();

  let items = Array.from(itemsStore.values());

  // アクセス制御
  if (!['admin', 'executive', 'manager', 'auditor'].includes(userRole)) {
    items = items.filter((item) => isUserTargeted(item, userId, userRole));
  }

  // openのみ
  items = items.filter((item) => item.status === 'open');

  // 既読チェック
  const itemIds = items.map((item) => item.id);
  const readIds = listReadIds(userId, 'handover', itemIds);

  return items.filter((item) => !readIds.has(item.id)).length;
}

/**
 * 申し送り取得
 */
export function getHandoverItem(itemId: string): HandoverItem | null {
  initializeStore();
  return itemsStore.get(itemId) ?? null;
}

/**
 * 申し送り作成
 */
export function createHandoverItem(
  data: CreateHandoverRequest,
  actorUserId: string,
  actorUserName?: string
): HandoverItem {
  initializeStore();

  const now = new Date().toISOString();
  const id = generateItemId();

  const item: HandoverItem = {
    id,
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
    createdAt: now,
    updatedAt: now,
  };

  itemsStore.set(id, item);

  return item;
}

/**
 * 申し送り更新
 */
export function updateHandoverItem(
  itemId: string,
  data: UpdateHandoverRequest,
  actorUserId: string,
  actorRole: AppRole
): { success: boolean; item?: HandoverItem; error?: string } {
  initializeStore();

  const item = itemsStore.get(itemId);
  if (!item) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  // 権限チェック: 作成者 or manager以上
  if (
    item.createdByUserId !== actorUserId &&
    !['admin', 'manager', 'executive'].includes(actorRole)
  ) {
    return { success: false, error: '更新権限がありません' };
  }

  const now = new Date().toISOString();
  const updated: HandoverItem = {
    ...item,
    title: data.title ?? item.title,
    body: data.body ?? item.body,
    priority: data.priority ?? item.priority,
    targetRolesJson: data.targetRoles !== undefined ? data.targetRoles : item.targetRolesJson,
    targetUserIdsJson: data.targetUserIds !== undefined ? data.targetUserIds : item.targetUserIdsJson,
    dueAt: data.dueAt !== undefined ? data.dueAt : item.dueAt,
    shift: data.shift !== undefined ? data.shift : item.shift,
    tagsJson: data.tags !== undefined ? data.tags : item.tagsJson,
    updatedAt: now,
  };

  itemsStore.set(itemId, updated);

  return { success: true, item: updated };
}

/**
 * 申し送り解決
 */
export function resolveHandoverItem(
  itemId: string,
  actorUserId: string,
  actorRole: AppRole
): { success: boolean; item?: HandoverItem; error?: string } {
  initializeStore();

  const item = itemsStore.get(itemId);
  if (!item) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  if (item.status !== 'open') {
    return { success: false, error: 'open状態の申し送りのみ解決可能です' };
  }

  // 権限チェック: leader以上
  if (!['admin', 'executive', 'manager', 'leader'].includes(actorRole)) {
    return { success: false, error: '解決権限がありません' };
  }

  const now = new Date().toISOString();
  const updated: HandoverItem = {
    ...item,
    status: 'resolved',
    updatedAt: now,
  };

  itemsStore.set(itemId, updated);

  return { success: true, item: updated };
}

/**
 * 申し送り再オープン
 */
export function reopenHandoverItem(
  itemId: string,
  actorUserId: string,
  actorRole: AppRole
): { success: boolean; item?: HandoverItem; error?: string } {
  initializeStore();

  const item = itemsStore.get(itemId);
  if (!item) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  if (item.status !== 'resolved') {
    return { success: false, error: 'resolved状態の申し送りのみ再オープン可能です' };
  }

  // 権限チェック: leader以上
  if (!['admin', 'executive', 'manager', 'leader'].includes(actorRole)) {
    return { success: false, error: '再オープン権限がありません' };
  }

  const now = new Date().toISOString();
  const updated: HandoverItem = {
    ...item,
    status: 'open',
    updatedAt: now,
  };

  itemsStore.set(itemId, updated);

  return { success: true, item: updated };
}

/**
 * 申し送りアーカイブ
 */
export function archiveHandoverItem(
  itemId: string,
  actorRole: AppRole
): { success: boolean; item?: HandoverItem; error?: string } {
  initializeStore();

  const item = itemsStore.get(itemId);
  if (!item) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  // 権限チェック: admin/manager のみ
  if (!['admin', 'manager'].includes(actorRole)) {
    return { success: false, error: 'アーカイブ権限がありません' };
  }

  const now = new Date().toISOString();
  const updated: HandoverItem = {
    ...item,
    status: 'archived',
    updatedAt: now,
  };

  itemsStore.set(itemId, updated);

  return { success: true, item: updated };
}

// ========================================
// コメント操作
// ========================================

/**
 * コメント追加
 */
export function addHandoverComment(
  itemId: string,
  message: string,
  actorUserId: string,
  actorUserName?: string
): { success: boolean; comment?: HandoverComment; error?: string } {
  initializeStore();

  const item = itemsStore.get(itemId);
  if (!item) {
    return { success: false, error: '申し送りが見つかりません' };
  }

  const now = new Date().toISOString();
  const id = generateCommentId();

  const comment: HandoverComment = {
    id,
    itemId,
    userId: actorUserId,
    userName: actorUserName,
    message,
    createdAt: now,
  };

  commentsStore.set(id, comment);

  // 申し送りの更新日時も更新
  const updated = { ...item, updatedAt: now };
  itemsStore.set(itemId, updated);

  return { success: true, comment };
}

/**
 * コメント一覧取得
 */
export function listHandoverComments(itemId: string): HandoverComment[] {
  initializeStore();

  const comments: HandoverComment[] = [];

  for (const comment of commentsStore.values()) {
    if (comment.itemId === itemId) {
      comments.push(comment);
    }
  }

  // 日時昇順
  comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return comments;
}

/**
 * コメント数取得
 */
function countComments(itemId: string): number {
  let count = 0;
  for (const comment of commentsStore.values()) {
    if (comment.itemId === itemId) {
      count++;
    }
  }
  return count;
}

// ========================================
// 既読統計（manager以上）
// ========================================

/**
 * 既読統計取得
 */
export function getHandoverReadStats(
  itemId: string
): { targetCount: number; readCount: number; unreadCount: number; readRate: number } | null {
  initializeStore();

  const item = itemsStore.get(itemId);
  if (!item) {
    return null;
  }

  const targetUserIds = getHandoverTargetUserIds(item);
  const stats = getReadStats('handover', itemId, targetUserIds);

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
export function markHandoverRead(itemId: string, userId: string): void {
  initializeStore();
  markRead(userId, 'handover', itemId);
}

// ========================================
// 全申し送りID取得（未読件数計算用）
// ========================================

/**
 * 全open申し送りIDを取得
 */
export function listOpenHandoverIds(): string[] {
  initializeStore();

  const ids: string[] = [];
  for (const item of itemsStore.values()) {
    if (item.status === 'open') {
      ids.push(item.id);
    }
  }
  return ids;
}

/**
 * ストアクリア（テスト用）
 */
export function clearHandoverStore(): void {
  itemsStore.clear();
  commentsStore.clear();
  isInitialized = false;
  itemIdCounter = 1;
  commentIdCounter = 1;
}
