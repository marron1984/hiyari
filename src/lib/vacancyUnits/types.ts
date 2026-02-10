/**
 * 空室外部提示 型定義
 *
 * Ticket 070: 空室 外部提示システム
 *
 * - 外部公開ボード（認証不要）
 * - 外部限定ボード（external accounts認証）
 * - 問い合わせ → チケット自動作成
 */

import type { AppRole } from '@/config/appRoles';

// ========== 基本型 ==========

/**
 * 空室ユニットステータス
 */
export type VacancyUnitStatus = 'active' | 'paused';

/**
 * データソース種別
 */
export type VacancySource = 'system' | 'manual' | 'sheet';

/**
 * ソース優先度（高い方が優先）
 */
export const SOURCE_PRIORITY: Record<VacancySource, number> = {
  system: 100,
  manual: 90,
  sheet: 80,
};

/**
 * 介護度条件
 */
export interface CareConditions {
  minCareLevel?: number | null;  // 要介護度 下限
  maxCareLevel?: number | null;  // 要介護度 上限
  acceptsDementia?: boolean;     // 認知症受入可
  acceptsMedicalCare?: boolean;  // 医療対応可
  acceptsTerminalCare?: boolean; // 看取り対応可
  note?: string;                 // 補足
}

/**
 * 料金レンジ
 */
export interface PriceRange {
  monthlyMin?: number | null;    // 月額下限（万円）
  monthlyMax?: number | null;    // 月額上限（万円）
  depositMin?: number | null;    // 敷金下限（万円）
  depositMax?: number | null;    // 敷金上限（万円）
  note?: string;                 // 料金備考
}

/**
 * 空室ユニット
 */
export interface VacancyUnit {
  id: string;
  businessUnitId: string;
  buildingName: string;
  area: string;                  // エリア（東京、神奈川など）
  roomType: string;              // 部屋タイプ（1K、個室など）
  capacity: number;              // 定員
  availableCount: number;        // 空室数
  availableFrom: string | null;  // 入居可能日（ISO形式）
  conditionsJson: CareConditions;
  priceRangeJson: PriceRange;
  status: VacancyUnitStatus;
  updatedAt: string;
  updatedByUserId: string;
  updatedByUserName?: string;
  createdAt: string;
  source?: VacancySource;
  sourcePriority?: number;
  sourceUpdatedAt?: string;
  roomNo?: string;
  residentName?: string;
  residentKana?: string;
  careLevel?: string;
  notes?: string;
}

/**
 * 空室ユニット更新ログ
 */
export interface VacancyUpdate {
  id: string;
  vacancyUnitId: string;
  businessUnitId: string;
  changedFieldsJson: Record<string, { before: unknown; after: unknown }>;
  createdAt: string;
  createdByUserId: string;
  createdByUserName?: string;
}

// ========== リクエスト型 ==========

export interface CreateVacancyUnitRequest {
  businessUnitId: string;
  buildingName: string;
  area: string;
  roomType: string;
  capacity: number;
  availableCount: number;
  availableFrom?: string | null;
  conditionsJson?: CareConditions;
  priceRangeJson?: PriceRange;
  status?: VacancyUnitStatus;
}

export interface UpdateVacancyUnitRequest {
  buildingName?: string;
  area?: string;
  roomType?: string;
  capacity?: number;
  availableCount?: number;
  availableFrom?: string | null;
  conditionsJson?: CareConditions;
  priceRangeJson?: PriceRange;
  status?: VacancyUnitStatus;
}

export interface VacancyInquiryRequest {
  vacancyUnitId?: string;
  businessUnitId?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  desiredMoveIn?: string;
  careLevel?: number;
  hasSpecialNeeds?: boolean;
  specialNeedsDetail?: string;
  message?: string;
}

// ========== フィルタ ==========

export interface VacancyUnitListFilter {
  businessUnitId?: string;
  status?: VacancyUnitStatus;
  area?: string;
  roomType?: string;          // Ticket 075: 部屋タイプフィルタ
  hasAvailability?: boolean;  // availableCount > 0
  limit?: number;
  offset?: number;
}

// ========== 統計 ==========

export interface VacancyUnitStats {
  totalUnits: number;
  activeUnits: number;
  totalAvailable: number;
  byBusinessUnit: Record<string, {
    units: number;
    available: number;
  }>;
}

// ========== 閲覧ログ（公開ボード用） ==========

export interface VacancyViewLog {
  id: string;
  businessUnitId: string | null;
  viewedAt: string;
  ipHint: string | null;      // IPはマスク or hash（生IP保存しない）
  userAgent: string | null;
  referer: string | null;
  path: string;
  queryJson: Record<string, string>;
}

// ========== 表示設定 ==========

export const VACANCY_UNIT_STATUS_CONFIG: Record<
  VacancyUnitStatus,
  { label: string; color: string; bg: string }
> = {
  active: { label: '公開中', color: 'text-green-700', bg: 'bg-green-50' },
  paused: { label: '一時停止', color: 'text-zinc-600', bg: 'bg-zinc-100' },
};

export const CARE_LEVEL_LABELS: Record<number, string> = {
  1: '要介護1',
  2: '要介護2',
  3: '要介護3',
  4: '要介護4',
  5: '要介護5',
};

// ========== 権限 ==========

export interface ViewerContext {
  userId: string;
  role: AppRole;
  modulePermissions?: { vacancies?: { canEdit?: boolean } };
}

/**
 * 空室ユニットを閲覧できるか
 */
export function canViewVacancyUnits(viewer: ViewerContext): boolean {
  return ['staff', 'leader', 'manager', 'executive', 'admin', 'auditor'].includes(viewer.role);
}

/**
 * 空室ユニットを編集できるか
 * Ticket 075: leader も編集可に
 * modulePermissions.vacancies.canEdit でも編集可
 */
export function canEditVacancyUnits(viewer: ViewerContext): boolean {
  if (['leader', 'manager', 'executive', 'admin'].includes(viewer.role)) return true;
  return viewer.modulePermissions?.vacancies?.canEdit === true;
}

/**
 * 空室ユニットを作成・削除できるか
 */
export function canManageVacancyUnits(viewer: ViewerContext): boolean {
  return ['executive', 'admin'].includes(viewer.role);
}

// ========== 公開用型（個人情報なし） ==========

export interface PublicVacancyUnit {
  id: string;
  businessUnitId: string;
  buildingName: string;
  area: string;
  roomType: string;
  capacity: number;
  availableCount: number;
  availableFrom: string | null;
  conditionsJson: CareConditions;
  priceRangeJson: PriceRange;
}

/**
 * VacancyUnitを公開用に変換
 */
export function toPublicVacancyUnit(unit: VacancyUnit): PublicVacancyUnit {
  return {
    id: unit.id,
    businessUnitId: unit.businessUnitId,
    buildingName: unit.buildingName,
    area: unit.area,
    roomType: unit.roomType,
    capacity: unit.capacity,
    availableCount: unit.availableCount,
    availableFrom: unit.availableFrom,
    conditionsJson: unit.conditionsJson,
    priceRangeJson: unit.priceRangeJson,
  };
}
