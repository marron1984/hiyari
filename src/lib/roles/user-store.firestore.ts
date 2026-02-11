/**
 * ユーザーロール管理ストア - Firestore実装
 *
 * PROD-003: 本番永続化
 *
 * コレクション: users, role_change_events
 *
 * 注意: usersコレクションは既存のFirebase Auth連携用 users と同一
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type { AppRole } from '@/config/appRoles';
import type {
  ManagedUser,
  RoleChangeEvent,
  ChangeRoleRequest,
  ListUsersOptions,
  UserRoleStats,
} from './types';

// ========== 定数 ==========

const USERS_COLLECTION = 'users';
const ROLE_CHANGE_EVENTS_COLLECTION = 'role_change_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

// ========== コンバーター ==========

function docToUser(doc: FirebaseFirestore.DocumentSnapshot): ManagedUser {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    email: data.email ?? '',
    name: data.name ?? '',
    role: data.role ?? 'staff',
    branchId: data.branchId,
    jobType: data.jobType,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): RoleChangeEvent {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    targetUserId: data.targetUserId ?? '',
    targetUserName: data.targetUserName ?? '',
    targetUserEmail: data.targetUserEmail ?? '',
    oldRole: data.oldRole ?? 'staff',
    newRole: data.newRole ?? 'staff',
    actorUserId: data.actorUserId ?? '',
    actorUserName: data.actorUserName ?? '',
    createdAt: data.createdAt ?? now(),
    note: data.note,
  };
}

// ========== CRUD ==========

/**
 * ユーザー一覧を取得
 */
export async function listUsers(options: ListUsersOptions = {}): Promise<{
  users: ManagedUser[];
  total: number;
}> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(USERS_COLLECTION);

  // ロールフィルター
  if (options.role) {
    q = q.where('role', '==', options.role);
  }

  const snapshot = await q.get();
  let users = snapshot.docs.map(docToUser);

  // 検索フィルター（Firestoreでは文字列部分一致が難しいためメモリでフィルタ）
  if (options.search) {
    const search = options.search.toLowerCase();
    users = users.filter(
      (u) =>
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search)
    );
  }

  // ソート（名前順）
  users.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const total = users.length;

  // ページネーション
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  users = users.slice(offset, offset + limit);

  return { users, total };
}

/**
 * ユーザーを取得
 */
export async function getUserById(userId: string): Promise<ManagedUser | null> {
  const db = getAdminDb();
  const doc = await db.collection(USERS_COLLECTION).doc(userId).get();
  if (!doc.exists) return null;
  return docToUser(doc);
}

/**
 * ロールを変更
 */
export async function changeUserRole(
  request: ChangeRoleRequest,
  actorUserId: string,
  actorUserName: string
): Promise<{ success: boolean; user?: ManagedUser; error?: string }> {
  const db = getAdminDb();
  const userRef = db.collection(USERS_COLLECTION).doc(request.userId);
  const doc = await userRef.get();

  if (!doc.exists) {
    return { success: false, error: 'ユーザーが見つかりません' };
  }

  const user = docToUser(doc);
  const oldRole = user.role;
  const newRole = request.newRole;

  // 同じロールへの変更は無視
  if (oldRole === newRole) {
    return { success: true, user };
  }

  const timestamp = now();

  // ユーザーを更新
  await userRef.update({
    role: newRole,
    updatedAt: timestamp,
  });

  // 監査ログを記録
  const eventId = `role_event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const event: RoleChangeEvent = {
    id: eventId,
    targetUserId: user.id,
    targetUserName: user.name,
    targetUserEmail: user.email,
    oldRole,
    newRole,
    actorUserId,
    actorUserName,
    createdAt: timestamp,
    note: request.note,
  };

  await db.collection(ROLE_CHANGE_EVENTS_COLLECTION).doc(eventId).set(event);

  const updatedUser: ManagedUser = {
    ...user,
    role: newRole,
    updatedAt: timestamp,
  };

  return { success: true, user: updatedUser };
}

/**
 * ロール変更履歴を取得
 */
export async function getRoleChangeEvents(options?: {
  targetUserId?: string;
  limit?: number;
}): Promise<RoleChangeEvent[]> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db
    .collection(ROLE_CHANGE_EVENTS_COLLECTION)
    .orderBy('createdAt', 'desc');

  if (options?.targetUserId) {
    q = q.where('targetUserId', '==', options.targetUserId);
  }

  if (options?.limit) {
    q = q.limit(options.limit);
  }

  const snapshot = await q.get();
  return snapshot.docs.map(docToEvent);
}

/**
 * ユーザー統計を取得
 */
export async function getUserRoleStats(): Promise<UserRoleStats> {
  const db = getAdminDb();
  const snapshot = await db.collection(USERS_COLLECTION).get();
  const users = snapshot.docs.map(docToUser);

  const byRole: Record<AppRole, number> = {
    admin: 0,
    executive: 0,
    manager: 0,
    leader: 0,
    staff: 0,
    auditor: 0,
  };

  for (const user of users) {
    byRole[user.role]++;
  }

  return {
    total: users.length,
    byRole,
  };
}

/**
 * ユーザーを追加
 */
export async function addUser(user: Omit<ManagedUser, 'createdAt' | 'updatedAt'>): Promise<ManagedUser> {
  const db = getAdminDb();
  const timestamp = now();
  const newUser: ManagedUser = {
    ...user,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(USERS_COLLECTION).doc(newUser.id).set(newUser);
  return newUser;
}
