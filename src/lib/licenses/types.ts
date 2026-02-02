/**
 * 資格管理（Licenses）型定義
 *
 * スタッフの保有資格・有効期限管理
 * Task 030: orgUnitIds によるスコープ対応（ユーザー所属ベース）
 */

import type { AppRole } from '@/config/appRoles';

/**
 * 資格カテゴリ
 */
export type LicenseCategory =
  | 'care'          // 介護系
  | 'nursing'       // 看護系
  | 'medical'       // 医療系
  | 'driving'       // 運転免許
  | 'safety'        // 安全関連
  | 'other';        // その他

/**
 * 資格ステータス
 */
export type LicenseStatus =
  | 'valid'         // 有効
  | 'expiring'      // 期限間近（30日以内）
  | 'expired'       // 期限切れ
  | 'pending';      // 申請中/未取得

/**
 * 資格記録
 */
export interface License {
  id: string;
  userId: string;
  userName?: string;
  userOrgUnitId: string | null;       // Task 030: ユーザーの所属組織（スコープ用）
  licenseName: string;
  licenseNumber: string | null;
  category: LicenseCategory;
  issuedAt: string | null;
  expiresAt: string | null;
  issuingAuthority: string | null;
  status: LicenseStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 資格作成リクエスト
 */
export interface CreateLicenseRequest {
  userId: string;
  licenseName: string;
  licenseNumber?: string | null;
  category?: LicenseCategory;
  issuedAt?: string | null;
  expiresAt?: string | null;
  issuingAuthority?: string | null;
  notes?: string | null;
}

/**
 * 資格更新リクエスト
 */
export interface UpdateLicenseRequest {
  licenseName?: string;
  licenseNumber?: string | null;
  category?: LicenseCategory;
  issuedAt?: string | null;
  expiresAt?: string | null;
  issuingAuthority?: string | null;
  notes?: string | null;
}

/**
 * 資格一覧フィルタ
 */
export interface LicenseListFilter {
  userId?: string;
  category?: LicenseCategory;
  status?: LicenseStatus;
  orgUnitIds?: string[];              // Task 030: 組織スコープ
  expiringWithinDays?: number;
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * 資格統計
 */
export interface LicenseStats {
  total: number;
  valid: number;
  expired: number;
  expiring30: number;                 // 30日以内に期限切れ
  pending: number;
}

/**
 * ビューアーコンテキスト
 */
export interface ViewerContext {
  userId: string;
  role: AppRole;
}

// ========== 表示設定 ==========

export const LICENSE_CATEGORY_CONFIG: Record<
  LicenseCategory,
  { label: string; icon: string; color: string; bg: string }
> = {
  care: { label: '介護系', icon: '🤲', color: 'text-blue-700', bg: 'bg-blue-50' },
  nursing: { label: '看護系', icon: '💉', color: 'text-pink-700', bg: 'bg-pink-50' },
  medical: { label: '医療系', icon: '🏥', color: 'text-red-700', bg: 'bg-red-50' },
  driving: { label: '運転免許', icon: '🚗', color: 'text-green-700', bg: 'bg-green-50' },
  safety: { label: '安全関連', icon: '🛡️', color: 'text-orange-700', bg: 'bg-orange-50' },
  other: { label: 'その他', icon: '📋', color: 'text-zinc-600', bg: 'bg-zinc-100' },
};

export const LICENSE_STATUS_CONFIG: Record<
  LicenseStatus,
  { label: string; color: string; bg: string; emoji: string }
> = {
  valid: { label: '有効', color: 'text-green-700', bg: 'bg-green-50', emoji: '✅' },
  expiring: { label: '期限間近', color: 'text-yellow-700', bg: 'bg-yellow-50', emoji: '⚠️' },
  expired: { label: '期限切れ', color: 'text-red-700', bg: 'bg-red-50', emoji: '❌' },
  pending: { label: '申請中', color: 'text-blue-700', bg: 'bg-blue-50', emoji: '⏳' },
};

// ========== 権限チェック ==========

export function canViewLicense(
  license: License,
  viewer: ViewerContext
): boolean {
  if (['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    return true;
  }
  // 自分の資格のみ
  return license.userId === viewer.userId;
}

export function canManageLicense(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin'].includes(viewer.role);
}

export function canViewAllStats(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(viewer.role);
}
