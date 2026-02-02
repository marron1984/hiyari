/**
 * 外部関係者アカウント型定義
 *
 * 外部ユーザーのログイン型アクセス管理
 * Share（リンク共有）より強い：アクセス制御・期限・監査ログ
 */

import type { ExternalRoleId, ExternalAllowedSection, ExternalMaskingConfig } from '@/config/externalRoles';

// ========== 権限コンテキスト ==========

export type InternalUserRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

export interface ViewerContext {
  userId: string;
  role: InternalUserRole;
}

// ========== 外部ユーザーステータス ==========

export type ExternalUserStatus = 'active' | 'invited' | 'disabled';

export const EXTERNAL_USER_STATUS_LABELS: Record<ExternalUserStatus, string> = {
  active: '有効',
  invited: '招待中',
  disabled: '無効',
};

export const EXTERNAL_USER_STATUS_CONFIG: Record<
  ExternalUserStatus,
  { label: string; color: string; bgColor: string }
> = {
  active: { label: '有効', color: 'text-green-700', bgColor: 'bg-green-50' },
  invited: { label: '招待中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  disabled: { label: '無効', color: 'text-zinc-500', bgColor: 'bg-zinc-100' },
};

// ========== 外部ユーザー ==========

export interface ExternalUser {
  id: string;
  email: string;
  displayName: string;
  organization: string | null;      // 所属組織名
  role: ExternalRoleId;
  status: ExternalUserStatus;
  invitedAt: string | null;
  lastLoginAt: string | null;
  expiresAt: string | null;         // 任意：契約満了で自動無効化
  createdByUserId: string;
  createdByName: string | null;     // 表示用
  note: string | null;              // 管理用メモ
  createdAt: string;
  updatedAt: string;
}

// ========== 外部アクセスポリシー ==========

export interface ExternalAccessPolicy {
  id: string;
  externalUserId: string;

  /** 許可セクション（ロールデフォルトを上書き） */
  allowSections: ExternalAllowedSection[];

  /** 許可事業単位ID（空配列で全事業） */
  allowBusinessUnitIds: string[];

  /** エンティティ別アクセス設定 */
  entityConfig: Record<string, {
    onlyAssigned?: boolean;
    aggregateOnly?: boolean;
  }>;

  /** マスキング設定 */
  masking: ExternalMaskingConfig;

  createdAt: string;
  updatedAt: string;
}

// ========== 監査ログ ==========

export type ExternalAuditAction =
  | 'login'
  | 'logout'
  | 'view'
  | 'download'
  | 'access_denied'
  | 'invited'
  | 'activated'
  | 'disabled'
  | 'policy_updated'
  | 'expired';

export interface ExternalAuditLog {
  id: string;
  externalUserId: string;
  action: ExternalAuditAction;
  targetType: string | null;        // 'wbr', 'alert', 'contract', etc.
  targetId: string | null;
  details: string | null;           // JSON文字列
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
}

// ========== 入力型 ==========

export interface CreateExternalUserInput {
  email: string;
  displayName: string;
  organization?: string | null;
  role: ExternalRoleId;
  expiresAt?: string | null;
  note?: string | null;
  /** 即座にアクティブにするか（falseなら招待状態） */
  activateImmediately?: boolean;
}

export interface UpdateExternalUserInput {
  displayName?: string;
  organization?: string | null;
  role?: ExternalRoleId;
  status?: ExternalUserStatus;
  expiresAt?: string | null;
  note?: string | null;
}

export interface UpdateAccessPolicyInput {
  allowSections?: ExternalAllowedSection[];
  allowBusinessUnitIds?: string[];
  entityConfig?: Record<string, {
    onlyAssigned?: boolean;
    aggregateOnly?: boolean;
  }>;
  masking?: Partial<ExternalMaskingConfig>;
}

// ========== 統計 ==========

export interface ExternalAccountsStats {
  total: number;
  active: number;
  invited: number;
  disabled: number;
  byRole: Record<ExternalRoleId, number>;
  expiringSoon: number;  // 30日以内に期限切れ
  recentLogins: number;  // 過去7日のログイン数
}

// ========== RBAC ==========

/**
 * 外部アカウントの閲覧が可能か
 */
export function canViewExternalAccounts(role: InternalUserRole): boolean {
  return ['admin', 'executive', 'auditor'].includes(role);
}

/**
 * 外部アカウントの管理が可能か
 */
export function canManageExternalAccounts(role: InternalUserRole): boolean {
  return ['admin', 'executive'].includes(role);
}

/**
 * 監査ログの閲覧が可能か
 */
export function canViewAuditLogs(role: InternalUserRole): boolean {
  return ['admin', 'executive', 'auditor'].includes(role);
}

// ========== ユーティリティ ==========

/**
 * 外部ユーザーが期限切れかどうか
 */
export function isExpired(user: ExternalUser): boolean {
  if (!user.expiresAt) return false;
  return new Date(user.expiresAt) < new Date();
}

/**
 * 外部ユーザーの期限切れまでの日数
 */
export function daysUntilExpiry(user: ExternalUser): number | null {
  if (!user.expiresAt) return null;
  const diffMs = new Date(user.expiresAt).getTime() - new Date().getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 期限切れが近いかどうか（30日以内）
 */
export function isExpiringSoon(user: ExternalUser, daysThreshold: number = 30): boolean {
  const days = daysUntilExpiry(user);
  if (days === null) return false;
  return days > 0 && days <= daysThreshold;
}
