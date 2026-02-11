/**
 * 周知事項 Firestoreストア
 *
 * PROD-003: 本番永続化
 *
 * コレクション: announcements
 *
 * 対応関数:
 * - listAnnouncements: 一覧取得
 * - getAnnouncementById: 詳細取得
 * - listAnnouncementsForUser: ユーザー対象一覧
 * - createAnnouncement: 作成
 * - publishAnnouncement: 公開
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type { AppRole } from '@/config/appRoles';
import type {
  Announcement,
  CreateAnnouncementRequest,
  AnnouncementFilter,
} from './types';

// ========== 定数 ==========

const ANNOUNCEMENTS_COLLECTION = 'announcements';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function docToAnnouncement(
  doc: FirebaseFirestore.DocumentSnapshot
): Announcement {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    title: data.title ?? '',
    content: data.content ?? '',
    status: data.status ?? 'draft',
    priority: data.priority ?? 'normal',
    targetRoles: data.targetRoles ?? [],
    targetUserIds: data.targetUserIds,
    targetBranchIds: data.targetBranchIds,
    publishedAt: data.publishedAt,
    expiresAt: data.expiresAt,
    ackDueAt: data.ackDueAt,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
    authorId: data.authorId ?? '',
    authorName: data.authorName ?? '',
  };
}

// ========== 一覧取得 ==========

/**
 * 周知事項一覧を取得
 */
export async function listAnnouncements(
  filter: AnnouncementFilter = {}
): Promise<{
  announcements: Announcement[];
  total: number;
}> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(ANNOUNCEMENTS_COLLECTION);

  // ステータスフィルタ
  if (filter.status) {
    q = q.where('status', '==', filter.status);
  } else {
    // デフォルトは公開済みのみ
    q = q.where('status', '==', 'published');
  }

  // 優先度フィルタ
  if (filter.priority) {
    q = q.where('priority', '==', filter.priority);
  }

  const snap = await q.get();
  let announcements = snap.docs.map(docToAnnouncement);

  // 検索フィルタ（メモリ内）
  if (filter.search) {
    const search = filter.search.toLowerCase();
    announcements = announcements.filter(
      (a) =>
        a.title.toLowerCase().includes(search) ||
        a.content.toLowerCase().includes(search)
    );
  }

  // ソート（公開日時 DESC）
  announcements.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  const total = announcements.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  announcements = announcements.slice(offset, offset + limit);

  return { announcements, total };
}

// ========== 詳細取得 ==========

/**
 * 周知事項を取得
 */
export async function getAnnouncementById(
  id: string
): Promise<Announcement | null> {
  const db = getAdminDb();
  const doc = await db.collection(ANNOUNCEMENTS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return docToAnnouncement(doc);
}

// ========== ユーザー対象一覧 ==========

/**
 * ユーザーが対象の周知事項を取得
 */
export async function listAnnouncementsForUser(
  userRole: AppRole,
  userId: string,
  userBranchId?: string,
  filter: AnnouncementFilter = {}
): Promise<{ announcements: Announcement[]; total: number }> {
  const db = getAdminDb();
  const q: FirebaseFirestore.Query = db
    .collection(ANNOUNCEMENTS_COLLECTION)
    .where('status', '==', 'published');

  const snap = await q.get();
  let announcements = snap.docs.map(docToAnnouncement);

  // ユーザーが対象かチェック
  announcements = announcements.filter((a) => {
    // ロールが対象に含まれるか
    const roleMatch = a.targetRoles.includes(userRole);

    // 個別指定されているか
    const userIdMatch = a.targetUserIds?.includes(userId);

    // 事業所が対象に含まれるか（指定がない場合は全事業所対象）
    const branchMatch =
      !a.targetBranchIds ||
      a.targetBranchIds.length === 0 ||
      (userBranchId && a.targetBranchIds.includes(userBranchId));

    return (roleMatch || userIdMatch) && branchMatch;
  });

  // 優先度フィルタ
  if (filter.priority) {
    announcements = announcements.filter(
      (a) => a.priority === filter.priority
    );
  }

  // 検索フィルタ
  if (filter.search) {
    const search = filter.search.toLowerCase();
    announcements = announcements.filter(
      (a) =>
        a.title.toLowerCase().includes(search) ||
        a.content.toLowerCase().includes(search)
    );
  }

  // ソート（公開日時 DESC）
  announcements.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  const total = announcements.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  announcements = announcements.slice(offset, offset + limit);

  return { announcements, total };
}

// ========== 作成 ==========

/**
 * 周知事項を作成
 */
export async function createAnnouncement(
  request: CreateAnnouncementRequest,
  authorId: string,
  authorName: string
): Promise<Announcement> {
  const db = getAdminDb();
  const docRef = db.collection(ANNOUNCEMENTS_COLLECTION).doc();
  const timestamp = now();

  const announcement: Announcement = {
    id: docRef.id,
    title: request.title,
    content: request.content,
    status: request.publishedAt ? 'published' : 'draft',
    priority: request.priority ?? 'normal',
    targetRoles: request.targetRoles,
    targetUserIds: request.targetUserIds,
    targetBranchIds: request.targetBranchIds,
    publishedAt: request.publishedAt,
    expiresAt: request.expiresAt,
    createdAt: timestamp,
    updatedAt: timestamp,
    authorId,
    authorName,
  };

  await docRef.set(announcement);
  return announcement;
}

// ========== 公開 ==========

/**
 * 周知事項を公開
 */
export async function publishAnnouncement(
  id: string
): Promise<Announcement | null> {
  const db = getAdminDb();
  const docRef = db.collection(ANNOUNCEMENTS_COLLECTION).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const timestamp = now();
  await docRef.update({
    status: 'published',
    publishedAt: timestamp,
    updatedAt: timestamp,
  });

  const updatedDoc = await docRef.get();
  return docToAnnouncement(updatedDoc);
}
