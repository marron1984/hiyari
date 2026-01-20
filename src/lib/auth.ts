// ======== 認証・権限チェックユーティリティ ========

import { UserRole, ROLE_LEVELS } from '@/types';

/**
 * ロールが指定レベル以上かチェック
 */
export function hasMinRole(userRole: UserRole | undefined, minRole: UserRole): boolean {
  if (!userRole) return false;
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[minRole];
}

/**
 * 承認権限があるかチェック（残業申請・稟議）
 * - leader: 自事業所のみ承認可能
 * - admin/system_admin: 全事業所承認可能
 */
export function canApprove(
  userRole: UserRole | undefined,
  userBranchId: string | undefined,
  targetBranchId: string
): boolean {
  if (!userRole) return false;

  // admin以上は全件承認可能
  if (hasMinRole(userRole, 'admin')) {
    return true;
  }

  // leaderは自事業所のみ
  if (userRole === 'leader' && userBranchId === targetBranchId) {
    return true;
  }

  return false;
}

/**
 * 管理者画面にアクセス可能かチェック
 */
export function canAccessAdmin(userRole: UserRole | undefined): boolean {
  return hasMinRole(userRole, 'leader');
}

/**
 * システム設定を変更可能かチェック
 */
export function canManageSettings(userRole: UserRole | undefined): boolean {
  return hasMinRole(userRole, 'admin');
}

/**
 * ユーザー管理が可能かチェック
 */
export function canManageUsers(userRole: UserRole | undefined): boolean {
  return hasMinRole(userRole, 'admin');
}

/**
 * ポイント手動調整が可能かチェック
 */
export function canAdjustPoints(userRole: UserRole | undefined): boolean {
  return hasMinRole(userRole, 'admin');
}

/**
 * ロール表示名
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'スタッフ',
  leader: 'リーダー',
  admin: '管理者',
  system_admin: 'システム管理者',
};

/**
 * 選択可能なロール一覧（ユーザー管理用）
 */
export const ASSIGNABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'user', label: 'スタッフ' },
  { value: 'leader', label: 'リーダー' },
  { value: 'admin', label: '管理者' },
];
