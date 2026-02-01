/**
 * ユーザーロール管理型定義
 */

import type { AppRole } from '@/config/appRoles';

/**
 * ユーザー（ロール管理用の最小情報）
 */
export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  branchId?: string;
  jobType?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * ロール変更イベント（監査ログ）
 */
export interface RoleChangeEvent {
  id: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string;
  oldRole: AppRole;
  newRole: AppRole;
  actorUserId: string;
  actorUserName: string;
  createdAt: string;
  note?: string;
}

/**
 * ロール変更リクエスト
 */
export interface ChangeRoleRequest {
  userId: string;
  newRole: AppRole;
  note?: string;
}

/**
 * ユーザー一覧取得オプション
 */
export interface ListUsersOptions {
  role?: AppRole;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * ユーザー統計
 */
export interface UserRoleStats {
  total: number;
  byRole: Record<AppRole, number>;
}

/**
 * AppRoleからUserRole（Firebase）への変換
 */
export function appRoleToUserRole(appRole: AppRole): string {
  switch (appRole) {
    case 'admin':
      return 'system_admin';
    case 'executive':
    case 'manager':
      return 'admin';
    case 'leader':
      return 'leader';
    case 'staff':
    case 'auditor':
    default:
      return 'user';
  }
}

/**
 * UserRole（Firebase）からAppRoleへの変換
 */
export function userRoleToAppRole(userRole?: string): AppRole {
  switch (userRole) {
    case 'system_admin':
      return 'admin';
    case 'admin':
      return 'manager';
    case 'leader':
      return 'leader';
    case 'user':
    default:
      return 'staff';
  }
}
