/**
 * ロール要求ヘルパー（サーバーコンポーネント用）
 *
 * 指定されたロールを持たないユーザーをリダイレクトまたは403エラー
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { AppRole } from '@/config/appRoles';

// ロール階層（数値が大きいほど権限が高い）
const ROLE_HIERARCHY: Record<AppRole, number> = {
  admin: 100,
  executive: 80,
  manager: 60,
  leader: 40,
  staff: 20,
  auditor: 10,
};

/**
 * 現在のユーザー情報を取得（サーバーサイド）
 *
 * 実装メモ:
 * - 本番ではセッション/Cookie/JWTからユーザー情報を取得
 * - 暫定としてヘッダーまたはデフォルト値を使用
 */
export interface CurrentUser {
  id: string;
  role: AppRole;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const headersList = await headers();

  // ヘッダーからユーザー情報を取得（開発/テスト用）
  const userIdHeader = headersList.get('x-user-id');
  const roleHeader = headersList.get('x-user-role');

  let role: AppRole = 'admin';
  if (roleHeader && isValidAppRole(roleHeader)) {
    role = roleHeader as AppRole;
  }

  // asRoleパラメータをチェック（プレビューモード用）
  const asRoleHeader = headersList.get('x-as-role');
  if (asRoleHeader && isValidAppRole(asRoleHeader)) {
    role = asRoleHeader as AppRole;
  }

  return {
    id: userIdHeader || 'user_001', // デフォルト: admin user
    role,
  };
}

/**
 * 現在のユーザーロールを取得（サーバーサイド）
 *
 * 実装メモ:
 * - 本番ではセッション/Cookie/JWTからユーザー情報を取得
 * - 暫定としてヘッダーまたはデフォルト値を使用
 */
export async function getCurrentUserRole(): Promise<AppRole> {
  const user = await getCurrentUser();
  return user.role;
}

/**
 * 有効なAppRoleかチェック
 */
function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}

/**
 * ロール階層で比較
 */
function hasMinimumRole(userRole: AppRole, requiredRole: AppRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * 管理者権限を要求
 */
export async function requireAdmin(options?: {
  redirectTo?: string;
  asRole?: string;
}): Promise<void> {
  const currentRole = await getCurrentUserRole();

  // asRoleがある場合はプレビューモード
  // ただし実際のロールがadminでない場合はプレビュー不可
  if (options?.asRole && isValidAppRole(options.asRole)) {
    // プレビューモードでも実際のadmin権限が必要
    if (currentRole !== 'admin') {
      redirect(options?.redirectTo ?? '/dashboard');
    }
    return;
  }

  if (currentRole !== 'admin') {
    redirect(options?.redirectTo ?? '/dashboard');
  }
}

/**
 * 指定されたロールのいずれかを要求
 */
export async function requireAnyRole(
  allowedRoles: AppRole[],
  options?: {
    redirectTo?: string;
    asRole?: string;
  }
): Promise<void> {
  const currentRole = await getCurrentUserRole();

  // asRoleがある場合はプレビューモード
  if (options?.asRole && isValidAppRole(options.asRole)) {
    // プレビュー中のロールで判定
    if (!allowedRoles.includes(options.asRole as AppRole)) {
      redirect(options?.redirectTo ?? '/dashboard');
    }
    return;
  }

  if (!allowedRoles.includes(currentRole)) {
    redirect(options?.redirectTo ?? '/dashboard');
  }
}

/**
 * 最低限のロールを要求（階層ベース）
 */
export async function requireMinRole(
  minimumRole: AppRole,
  options?: {
    redirectTo?: string;
    asRole?: string;
  }
): Promise<void> {
  const currentRole = await getCurrentUserRole();

  // asRoleがある場合はプレビューモード
  if (options?.asRole && isValidAppRole(options.asRole)) {
    if (!hasMinimumRole(options.asRole as AppRole, minimumRole)) {
      redirect(options?.redirectTo ?? '/dashboard');
    }
    return;
  }

  if (!hasMinimumRole(currentRole, minimumRole)) {
    redirect(options?.redirectTo ?? '/dashboard');
  }
}

/**
 * アクセス拒否（403）をスロー
 */
export function denyAccess(message = 'アクセス権限がありません'): never {
  throw new Error(message);
}

/**
 * ロールチェック（リダイレクトなし）
 */
export async function checkRole(allowedRoles: AppRole[]): Promise<boolean> {
  const currentRole = await getCurrentUserRole();
  return allowedRoles.includes(currentRole);
}

/**
 * 管理者チェック（リダイレクトなし）
 */
export async function isAdmin(): Promise<boolean> {
  const currentRole = await getCurrentUserRole();
  return currentRole === 'admin';
}
