/**
 * 修繕管理（Repairs）型定義
 *
 * 設備故障・修繕依頼の管理
 * Task 030: businessUnitId によるスコープ対応
 */

import type { AppRole } from '@/config/appRoles';

/**
 * 修繕ステータス
 */
export type RepairStatus =
  | 'reported'      // 報告済み
  | 'assessing'     // 調査中
  | 'scheduled'     // 修繕予定
  | 'in_progress'   // 修繕中
  | 'completed'     // 完了
  | 'cancelled';    // キャンセル

/**
 * 安全リスクレベル
 */
export type SafetyRisk = 'high' | 'medium' | 'low' | 'none';

/**
 * 修繕カテゴリ
 */
export type RepairCategory =
  | 'electrical'    // 電気設備
  | 'plumbing'      // 給排水
  | 'hvac'          // 空調
  | 'structural'    // 建物構造
  | 'equipment'     // 機器
  | 'other';        // その他

/**
 * 修繕記録
 */
export interface RepairRecord {
  id: string;
  title: string;
  description: string;
  status: RepairStatus;
  category: RepairCategory;
  safetyRisk: SafetyRisk;
  businessUnitId: string | null;      // Task 030: 事業単位スコープ
  location: string | null;
  reportedByUserId: string;
  reportedByUserName?: string;
  assignedVendor: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  scheduledAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 修繕作成リクエスト
 */
export interface CreateRepairRequest {
  title: string;
  description: string;
  category?: RepairCategory;
  safetyRisk?: SafetyRisk;
  businessUnitId?: string | null;
  location?: string | null;
  dueAt?: string | null;
}

/**
 * 修繕更新リクエスト
 */
export interface UpdateRepairRequest {
  title?: string;
  description?: string;
  category?: RepairCategory;
  safetyRisk?: SafetyRisk;
  location?: string | null;
  assignedVendor?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  scheduledAt?: string | null;
  dueAt?: string | null;
}

/**
 * 修繕一覧フィルタ
 */
export interface RepairListFilter {
  status?: RepairStatus;
  category?: RepairCategory;
  safetyRisk?: SafetyRisk;
  businessUnitId?: string | null;     // Task 030: 事業単位スコープ
  overdue?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * 修繕統計
 */
export interface RepairStats {
  total: number;
  open: number;
  highRiskOpen: number;
  overdue: number;
  completedThisMonth: number;
  avgCompletionDays: number | null;
}

/**
 * ビューアーコンテキスト
 */
export interface ViewerContext {
  userId: string;
  role: AppRole;
}

// ========== 表示設定 ==========

export const REPAIR_STATUS_CONFIG: Record<
  RepairStatus,
  { label: string; color: string; bg: string }
> = {
  reported: { label: '報告済み', color: 'text-blue-700', bg: 'bg-blue-50' },
  assessing: { label: '調査中', color: 'text-purple-700', bg: 'bg-purple-50' },
  scheduled: { label: '修繕予定', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  in_progress: { label: '修繕中', color: 'text-orange-700', bg: 'bg-orange-50' },
  completed: { label: '完了', color: 'text-green-700', bg: 'bg-green-50' },
  cancelled: { label: 'キャンセル', color: 'text-zinc-500', bg: 'bg-zinc-100' },
};

export const SAFETY_RISK_CONFIG: Record<
  SafetyRisk,
  { label: string; color: string; bg: string; emoji: string }
> = {
  high: { label: '高リスク', color: 'text-red-700', bg: 'bg-red-50', emoji: '🔴' },
  medium: { label: '中リスク', color: 'text-orange-700', bg: 'bg-orange-50', emoji: '🟠' },
  low: { label: '低リスク', color: 'text-yellow-700', bg: 'bg-yellow-50', emoji: '🟡' },
  none: { label: 'リスクなし', color: 'text-green-700', bg: 'bg-green-50', emoji: '🟢' },
};

export const REPAIR_CATEGORY_CONFIG: Record<
  RepairCategory,
  { label: string; icon: string }
> = {
  electrical: { label: '電気設備', icon: '⚡' },
  plumbing: { label: '給排水', icon: '🚰' },
  hvac: { label: '空調', icon: '❄️' },
  structural: { label: '建物構造', icon: '🏗️' },
  equipment: { label: '機器', icon: '🔧' },
  other: { label: 'その他', icon: '📋' },
};

// ========== 権限チェック ==========

export function canViewRepair(
  repair: RepairRecord,
  viewer: ViewerContext
): boolean {
  if (['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    return true;
  }
  return repair.reportedByUserId === viewer.userId;
}

export function canManageRepair(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin'].includes(viewer.role);
}
