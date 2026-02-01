/**
 * ユーザーロール管理ストア
 *
 * インメモリストレージ（本番ではFirestoreに置き換え）
 */

import type { AppRole } from '@/config/appRoles';
import type {
  ManagedUser,
  RoleChangeEvent,
  ChangeRoleRequest,
  ListUsersOptions,
  UserRoleStats,
} from './types';

// インメモリストレージ
const usersStore = new Map<string, ManagedUser>();
const roleChangeEvents: RoleChangeEvent[] = [];

// ID生成
let eventIdCounter = 1;

function generateEventId(): string {
  return `role_event_${Date.now()}_${eventIdCounter++}`;
}

// 初期化フラグ
let isInitialized = false;

/**
 * デモ用ユーザーデータで初期化
 */
function initializeStore(): void {
  if (isInitialized) return;

  const demoUsers: ManagedUser[] = [
    {
      id: 'user_001',
      email: 'yoshida@aska-g.com',
      name: '吉田 太郎',
      role: 'admin',
      branchId: 'main',
      jobType: '管理者',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'user_002',
      email: 'tanaka@aska-g.com',
      name: '田中 花子',
      role: 'executive',
      branchId: 'main',
      jobType: '管理者',
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
    },
    {
      id: 'user_003',
      email: 'suzuki@aska-g.com',
      name: '鈴木 一郎',
      role: 'manager',
      branchId: 'branch_a',
      jobType: '相談員',
      createdAt: '2024-02-01T00:00:00Z',
      updatedAt: '2024-02-01T00:00:00Z',
    },
    {
      id: 'user_004',
      email: 'yamada@aska-g.com',
      name: '山田 美咲',
      role: 'leader',
      branchId: 'branch_a',
      jobType: '介護職',
      createdAt: '2024-02-15T00:00:00Z',
      updatedAt: '2024-02-15T00:00:00Z',
    },
    {
      id: 'user_005',
      email: 'sato@aska-g.com',
      name: '佐藤 健二',
      role: 'staff',
      branchId: 'branch_a',
      jobType: '介護職',
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    },
    {
      id: 'user_006',
      email: 'takahashi@aska-g.com',
      name: '高橋 直樹',
      role: 'staff',
      branchId: 'branch_b',
      jobType: '看護職',
      createdAt: '2024-03-15T00:00:00Z',
      updatedAt: '2024-03-15T00:00:00Z',
    },
    {
      id: 'user_007',
      email: 'ito@aska-g.com',
      name: '伊藤 麻衣',
      role: 'staff',
      branchId: 'branch_b',
      jobType: '介護職',
      createdAt: '2024-04-01T00:00:00Z',
      updatedAt: '2024-04-01T00:00:00Z',
    },
    {
      id: 'user_008',
      email: 'watanabe@aska-g.com',
      name: '渡辺 翔太',
      role: 'leader',
      branchId: 'branch_b',
      jobType: '介護職',
      createdAt: '2024-04-15T00:00:00Z',
      updatedAt: '2024-04-15T00:00:00Z',
    },
    {
      id: 'user_009',
      email: 'audit@aska-g.com',
      name: '監査 太郎',
      role: 'auditor',
      branchId: 'main',
      jobType: '事務職',
      createdAt: '2024-05-01T00:00:00Z',
      updatedAt: '2024-05-01T00:00:00Z',
    },
  ];

  for (const user of demoUsers) {
    usersStore.set(user.id, user);
  }

  isInitialized = true;
}

/**
 * ユーザー一覧を取得
 */
export function listUsers(options: ListUsersOptions = {}): {
  users: ManagedUser[];
  total: number;
} {
  initializeStore();

  let users = Array.from(usersStore.values());

  // ロールフィルター
  if (options.role) {
    users = users.filter((u) => u.role === options.role);
  }

  // 検索フィルター
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
export function getUserById(userId: string): ManagedUser | null {
  initializeStore();
  return usersStore.get(userId) ?? null;
}

/**
 * ロールを変更
 */
export function changeUserRole(
  request: ChangeRoleRequest,
  actorUserId: string,
  actorUserName: string
): { success: boolean; user?: ManagedUser; error?: string } {
  initializeStore();

  const user = usersStore.get(request.userId);
  if (!user) {
    return { success: false, error: 'ユーザーが見つかりません' };
  }

  const oldRole = user.role;
  const newRole = request.newRole;

  // 同じロールへの変更は無視
  if (oldRole === newRole) {
    return { success: true, user };
  }

  // 更新
  const now = new Date().toISOString();
  user.role = newRole;
  user.updatedAt = now;
  usersStore.set(user.id, user);

  // 監査ログ
  const event: RoleChangeEvent = {
    id: generateEventId(),
    targetUserId: user.id,
    targetUserName: user.name,
    targetUserEmail: user.email,
    oldRole,
    newRole,
    actorUserId,
    actorUserName,
    createdAt: now,
    note: request.note,
  };
  roleChangeEvents.push(event);

  return { success: true, user };
}

/**
 * ロール変更履歴を取得
 */
export function getRoleChangeEvents(options?: {
  targetUserId?: string;
  limit?: number;
}): RoleChangeEvent[] {
  initializeStore();

  let events = [...roleChangeEvents];

  if (options?.targetUserId) {
    events = events.filter((e) => e.targetUserId === options.targetUserId);
  }

  // 新しい順
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (options?.limit) {
    events = events.slice(0, options.limit);
  }

  return events;
}

/**
 * ユーザー統計を取得
 */
export function getUserRoleStats(): UserRoleStats {
  initializeStore();

  const users = Array.from(usersStore.values());

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
 * ユーザーを追加（デモ用）
 */
export function addUser(user: Omit<ManagedUser, 'createdAt' | 'updatedAt'>): ManagedUser {
  initializeStore();

  const now = new Date().toISOString();
  const newUser: ManagedUser = {
    ...user,
    createdAt: now,
    updatedAt: now,
  };

  usersStore.set(newUser.id, newUser);
  return newUser;
}

/**
 * ストアをクリア（テスト用）
 */
export function clearUserStore(): void {
  usersStore.clear();
  roleChangeEvents.length = 0;
  eventIdCounter = 1;
  isInitialized = false;
}
