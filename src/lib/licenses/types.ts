/**
 * 資格管理（Licenses）型定義
 *
 * - license_types: 資格種別マスタ
 * - user_licenses: ユーザーごとの資格保有レコード
 * - license_renewal_events: 更新履歴
 *
 * Task 030: orgUnitIds によるスコープ対応（user_org_memberships経由）
 */

import type { AppRole } from '@/config/appRoles';

// ========== 資格種別マスタ ==========

export type LicenseCategoryType = 'care' | 'nursing' | 'admin' | 'other';

export interface LicenseType {
  id: string;
  name: string;
  category: LicenseCategoryType;
  requiresRenewal: boolean;
  defaultRenewalMonths: number | null;
  defaultWarnDays: number | null;       // 期限切れ警告日数
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ========== ユーザー資格 ==========

export type UserLicenseStatus = 'active' | 'expired' | 'suspended' | 'unknown';

export interface UserLicense {
  id: string;
  userId: string;
  licenseTypeId: string;
  licenseNumber: string | null;
  issuedAt: string | null;              // YYYY-MM-DD
  expiresAt: string | null;             // YYYY-MM-DD
  status: UserLicenseStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ========== 更新履歴 ==========

export interface LicenseRenewalEvent {
  id: string;
  userLicenseId: string;
  oldExpiresAt: string | null;
  newExpiresAt: string | null;
  renewedAt: string | null;
  actorUserId: string | null;
  note: string | null;
  createdAt: string;
}

// ========== フィルタ ==========

export interface LicenseListFilters {
  // スコープ
  orgUnitIds?: string[];               // manager以上で有効
  myOnly?: boolean;                    // staff/leaderは強制true

  // フィルタ
  userId?: string;
  status?: UserLicenseStatus[];
  licenseTypeId?: string;
  category?: LicenseCategoryType;
  expiringWithinDays?: number;         // 例: 30
  expired?: boolean;
  q?: string;                          // userName or licenseName
}

export interface Pagination {
  limit?: number;
  offset?: number;
}

// ========== 一覧アイテム ==========

export interface LicenseListItem {
  userLicense: UserLicense;
  licenseType: Pick<LicenseType, 'id' | 'name' | 'category' | 'requiresRenewal' | 'defaultWarnDays'>;
  user: {
    id: string;
    name: string | null;
    orgUnitId: string | null;          // スコープ判定用
  };
}

// ========== 統計 ==========

export interface LicenseStats {
  expired: number;
  expiring30: number;
  expiring90: number;
  totalActive: number;
}

// ========== 作成・更新リクエスト ==========

export interface CreateUserLicenseRequest {
  userId: string;
  licenseTypeId: string;
  licenseNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
}

export interface UpdateUserLicenseRequest {
  licenseNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  status?: UserLicenseStatus;
  notes?: string | null;
}

export interface RenewLicenseRequest {
  newExpiresAt: string;
  note?: string | null;
}

// ========== ビューアーコンテキスト ==========

export interface ViewerContext {
  userId: string;
  role: AppRole;
  orgUnitIds?: string[];               // 所属組織（スコープ用）
}

// ========== 表示設定 ==========

export const LICENSE_CATEGORY_CONFIG: Record<
  LicenseCategoryType,
  { label: string; icon: string; color: string; bg: string }
> = {
  care: { label: '介護系', icon: '🤲', color: 'text-blue-700', bg: 'bg-blue-50' },
  nursing: { label: '看護系', icon: '💉', color: 'text-pink-700', bg: 'bg-pink-50' },
  admin: { label: '事務系', icon: '📋', color: 'text-zinc-700', bg: 'bg-zinc-100' },
  other: { label: 'その他', icon: '📜', color: 'text-zinc-600', bg: 'bg-zinc-50' },
};

export const LICENSE_STATUS_CONFIG: Record<
  UserLicenseStatus,
  { label: string; color: string; bg: string; emoji: string }
> = {
  active: { label: '有効', color: 'text-green-700', bg: 'bg-green-50', emoji: '✅' },
  expired: { label: '期限切れ', color: 'text-red-700', bg: 'bg-red-50', emoji: '❌' },
  suspended: { label: '停止中', color: 'text-orange-700', bg: 'bg-orange-50', emoji: '⏸️' },
  unknown: { label: '不明', color: 'text-zinc-500', bg: 'bg-zinc-100', emoji: '❓' },
};

// ========== 権限チェック ==========

/**
 * 資格を閲覧できるか
 * - manager以上: orgUnitIdsでスコープされた範囲
 * - staff/leader: 自分のみ
 */
export function canViewLicense(
  userLicense: { userId: string },
  user: { orgUnitId: string | null },
  viewer: ViewerContext
): boolean {
  // 管理者系は組織スコープで判定
  if (['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    // スコープ指定がなければ全体閲覧可
    if (!viewer.orgUnitIds || viewer.orgUnitIds.length === 0) {
      return true;
    }
    // ユーザーの組織がスコープ内にあるか
    return user.orgUnitId !== null && viewer.orgUnitIds.includes(user.orgUnitId);
  }
  // staff/leaderは自分のみ
  return userLicense.userId === viewer.userId;
}

/**
 * 資格を管理できるか
 */
export function canManageLicense(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin'].includes(viewer.role);
}

/**
 * 全体統計を閲覧できるか
 */
export function canViewLicenseStats(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(viewer.role);
}
