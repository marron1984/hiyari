/**
 * 是正措置（Corrective Actions）型定義
 *
 * インシデント・クレーム等から派生する改善措置の管理
 * Task 030: businessUnitId によるスコープ対応
 */

import type { AppRole } from '@/config/appRoles';

/**
 * 是正措置ステータス
 */
export type CorrectiveActionStatus =
  | 'open'          // オープン
  | 'in_progress'   // 対応中
  | 'pending_review'// レビュー待ち
  | 'completed'     // 完了
  | 'closed'        // クローズ
  | 'cancelled';    // キャンセル

/**
 * 重要度
 */
export type CorrectiveActionSeverity = 'critical' | 'major' | 'minor';

/**
 * ソースタイプ（何から派生したか）
 */
export type SourceType =
  | 'incident'      // インシデント/ヒヤリハット
  | 'complaint'     // クレーム
  | 'audit'         // 監査
  | 'committee'     // 委員会
  | 'repair'        // 修繕
  | 'manual';       // 手動作成

/**
 * 是正措置
 */
export interface CorrectiveAction {
  id: string;
  title: string;
  description: string;
  status: CorrectiveActionStatus;
  severity: CorrectiveActionSeverity;
  sourceType: SourceType;
  sourceId: string | null;
  businessUnitId: string | null;      // Task 030: 事業単位スコープ
  rootCause: string | null;
  actionPlan: string | null;
  ownerUserId: string | null;
  ownerUserName?: string | null;
  createdByUserId: string;
  createdByUserName?: string;
  dueAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  verifiedByUserName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 是正措置作成リクエスト
 */
export interface CreateCorrectiveActionRequest {
  title: string;
  description: string;
  severity?: CorrectiveActionSeverity;
  sourceType?: SourceType;
  sourceId?: string | null;
  businessUnitId?: string | null;
  rootCause?: string | null;
  actionPlan?: string | null;
  ownerUserId?: string | null;
  dueAt?: string | null;
}

/**
 * 是正措置更新リクエスト
 */
export interface UpdateCorrectiveActionRequest {
  title?: string;
  description?: string;
  severity?: CorrectiveActionSeverity;
  rootCause?: string | null;
  actionPlan?: string | null;
  ownerUserId?: string | null;
  dueAt?: string | null;
}

/**
 * 是正措置一覧フィルタ
 */
export interface CorrectiveActionListFilter {
  status?: CorrectiveActionStatus;
  severity?: CorrectiveActionSeverity;
  sourceType?: SourceType;
  businessUnitId?: string | null;     // Task 030: 事業単位スコープ
  overdue?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * 是正措置統計
 */
export interface CorrectiveActionStats {
  total: number;
  open: number;
  criticalOpen: number;
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

export const CA_STATUS_CONFIG: Record<
  CorrectiveActionStatus,
  { label: string; color: string; bg: string }
> = {
  open: { label: 'オープン', color: 'text-blue-700', bg: 'bg-blue-50' },
  in_progress: { label: '対応中', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  pending_review: { label: 'レビュー待ち', color: 'text-purple-700', bg: 'bg-purple-50' },
  completed: { label: '完了', color: 'text-green-700', bg: 'bg-green-50' },
  closed: { label: 'クローズ', color: 'text-zinc-600', bg: 'bg-zinc-100' },
  cancelled: { label: 'キャンセル', color: 'text-zinc-500', bg: 'bg-zinc-50' },
};

export const CA_SEVERITY_CONFIG: Record<
  CorrectiveActionSeverity,
  { label: string; color: string; bg: string; emoji: string }
> = {
  critical: { label: '重大', color: 'text-red-700', bg: 'bg-red-50', emoji: '🔴' },
  major: { label: '重要', color: 'text-orange-700', bg: 'bg-orange-50', emoji: '🟠' },
  minor: { label: '軽微', color: 'text-yellow-700', bg: 'bg-yellow-50', emoji: '🟡' },
};

export const SOURCE_TYPE_CONFIG: Record<
  SourceType,
  { label: string; icon: string }
> = {
  incident: { label: 'インシデント', icon: '⚠️' },
  complaint: { label: 'クレーム', icon: '😤' },
  audit: { label: '監査', icon: '📋' },
  committee: { label: '委員会', icon: '👥' },
  repair: { label: '修繕', icon: '🔧' },
  manual: { label: '手動作成', icon: '✏️' },
};

// ========== 権限チェック ==========

export function canViewCorrectiveAction(
  ca: CorrectiveAction,
  viewer: ViewerContext
): boolean {
  if (['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    return true;
  }
  return (
    ca.createdByUserId === viewer.userId ||
    ca.ownerUserId === viewer.userId
  );
}

export function canManageCorrectiveAction(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin'].includes(viewer.role);
}
