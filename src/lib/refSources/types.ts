/**
 * 紹介元（ref）管理 型定義
 *
 * Ticket 073: 紹介元refトラッキング
 *
 * 紹介会社、病院、ケアマネージャー等からの問い合わせ追跡用
 */

import type { AppRole } from '@/config/appRoles';

/**
 * 紹介元タイプ
 */
export type RefSourceType = 'hospital' | 'care_manager' | 'agency' | 'other';

/**
 * 紹介元ステータス
 */
export type RefSourceStatus = 'active' | 'disabled';

/**
 * 紹介元（ref_sources）
 */
export interface RefSource {
  /** refコード（docId）例: ABC123 */
  ref: string;
  /** 紹介元名 */
  name: string;
  /** タイプ */
  type: RefSourceType;
  /** ステータス */
  status: RefSourceStatus;
  /** 許可された事業単位ID（空 = 全事業許可） */
  allowedBusinessUnitIds: string[];
  /** 作成日時 */
  createdAt: string;
  /** 作成者ID */
  createdByUserId: string;
  /** 更新日時 */
  updatedAt: string;
  /** メモ（任意） */
  note?: string;
}

/**
 * 紹介元アクセスログ（ref_access_logs）
 */
export interface RefAccessLog {
  id: string;
  ref: string;
  path: string;
  occurredAt: string;
  ipHint?: string;      // マスク済みIP（例: 192.168.xxx.xxx）
  userAgent?: string;
}

/**
 * 紹介元作成リクエスト
 */
export interface CreateRefSourceRequest {
  /** refコード（省略時は自動生成） */
  ref?: string;
  name: string;
  type: RefSourceType;
  allowedBusinessUnitIds?: string[];
  note?: string;
}

/**
 * 紹介元更新リクエスト
 */
export interface UpdateRefSourceRequest {
  name?: string;
  type?: RefSourceType;
  status?: RefSourceStatus;
  allowedBusinessUnitIds?: string[];
  note?: string;
}

/**
 * 紹介元一覧フィルタ
 */
export interface RefSourceListFilter {
  status?: RefSourceStatus;
  type?: RefSourceType;
  businessUnitId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * 紹介元タイプ表示設定
 */
export const REF_SOURCE_TYPE_CONFIG: Record<RefSourceType, { label: string; icon: string }> = {
  hospital: { label: '病院', icon: '🏥' },
  care_manager: { label: 'ケアマネ', icon: '👤' },
  agency: { label: '紹介会社', icon: '🏢' },
  other: { label: 'その他', icon: '📋' },
};

/**
 * 紹介元ステータス表示設定
 */
export const REF_SOURCE_STATUS_CONFIG: Record<RefSourceStatus, { label: string; color: string; bg: string }> = {
  active: { label: '有効', color: 'text-green-700', bg: 'bg-green-50' },
  disabled: { label: '無効', color: 'text-gray-500', bg: 'bg-gray-100' },
};

/**
 * ビューアーコンテキスト
 */
export interface ViewerContext {
  userId: string;
  role: AppRole;
}

/**
 * 権限チェック：紹介元を管理できるか
 */
export function canManageRefSources(viewer: ViewerContext): boolean {
  return ['admin', 'manager'].includes(viewer.role);
}

/**
 * 権限チェック：紹介元を閲覧できるか
 */
export function canViewRefSources(viewer: ViewerContext): boolean {
  return ['admin', 'manager', 'executive', 'auditor'].includes(viewer.role);
}
