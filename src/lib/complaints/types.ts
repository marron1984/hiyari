/**
 * クレーム対応 型定義
 *
 * クレームの受付→調査→対応→再発防止→クローズを管理
 * 機微情報が入りやすいため、RBACと表示最小化を最優先
 */

import type { AppRole } from '@/config/appRoles';

// ========== カテゴリ・重要度・ステータス ==========

/** クレームカテゴリ */
export type ComplaintCategory =
  | 'service'
  | 'staff'
  | 'billing'
  | 'safety'
  | 'facility'
  | 'other';

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  service: 'サービス',
  staff: 'スタッフ',
  billing: '請求',
  safety: '安全',
  facility: '施設',
  other: 'その他',
};

/** 重要度 */
export type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical';

export const COMPLAINT_SEVERITY_LABELS: Record<ComplaintSeverity, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '重大',
};

export const COMPLAINT_SEVERITY_CONFIG: Record<
  ComplaintSeverity,
  { label: string; bg: string; text: string; border: string }
> = {
  critical: {
    label: '重大',
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
  },
  high: {
    label: '高',
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-300',
  },
  medium: {
    label: '中',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-300',
  },
  low: {
    label: '低',
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    border: 'border-zinc-300',
  },
};

/** ステータス */
export type ComplaintStatus =
  | 'new'
  | 'triaging'
  | 'investigating'
  | 'responding'
  | 'preventing'
  | 'resolved'
  | 'closed'
  | 'archived';

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: '新規',
  triaging: 'トリアージ中',
  investigating: '調査中',
  responding: '対応中',
  preventing: '再発防止中',
  resolved: '解決済み',
  closed: 'クローズ',
  archived: 'アーカイブ',
};

export const COMPLAINT_STATUS_CONFIG: Record<
  ComplaintStatus,
  { label: string; bg: string; text: string }
> = {
  new: { label: '新規', bg: 'bg-blue-100', text: 'text-blue-700' },
  triaging: { label: 'トリアージ中', bg: 'bg-purple-100', text: 'text-purple-700' },
  investigating: { label: '調査中', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  responding: { label: '対応中', bg: 'bg-amber-100', text: 'text-amber-700' },
  preventing: { label: '再発防止中', bg: 'bg-teal-100', text: 'text-teal-700' },
  resolved: { label: '解決済み', bg: 'bg-green-100', text: 'text-green-700' },
  closed: { label: 'クローズ', bg: 'bg-zinc-100', text: 'text-zinc-600' },
  archived: { label: 'アーカイブ', bg: 'bg-zinc-50', text: 'text-zinc-400' },
};

/** 申立人種別 */
export type RequesterType =
  | 'family'
  | 'client'
  | 'partner'
  | 'staff'
  | 'anonymous'
  | 'other';

export const REQUESTER_TYPE_LABELS: Record<RequesterType, string> = {
  family: 'ご家族',
  client: '利用者',
  partner: '取引先',
  staff: '職員',
  anonymous: '匿名',
  other: 'その他',
};

/** アクションステータス */
export type ComplaintActionStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export const COMPLAINT_ACTION_STATUS_LABELS: Record<ComplaintActionStatus, string> = {
  open: '未着手',
  in_progress: '対応中',
  done: '完了',
  cancelled: '取消',
};

// ========== エンティティ ==========

/** クレーム本体 */
export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  requesterType: RequesterType;
  requesterName: string | null;
  contactHint: string | null;
  occurredAt: string | null;
  receivedAt: string;
  dueAt: string | null;
  assigneeUserId: string | null;
  ownerRole: string | null;
  resolutionSummary: string | null;
  rootCause: string | null;
  preventivePlan: string | null;
  relatedTicketId: string | null;
  relatedCommitteeActionId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

/** コメント（対応ログ・メモ） */
export interface ComplaintComment {
  id: string;
  complaintId: string;
  userId: string;
  message: string;
  createdAt: string;
}

/** 是正アクション */
export interface ComplaintAction {
  id: string;
  complaintId: string;
  title: string;
  ownerUserId: string | null;
  dueAt: string | null;
  status: ComplaintActionStatus;
  createdAt: string;
  updatedAt: string;
}

/** 監査ログ */
export interface ComplaintEvent {
  id: string;
  complaintId: string;
  actorUserId: string | null;
  action:
    | 'create'
    | 'assign'
    | 'status_change'
    | 'add_comment'
    | 'set_due'
    | 'mark_resolved'
    | 'close'
    | 'reopen'
    | 'update_fields';
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
  note: string | null;
}

// ========== 統計・サマリー ==========

/** 統計 */
export interface ComplaintStats {
  open: number;
  criticalOpen: number;
  overdue: number;
  myAssignedOpen: number;
  resolvedThisMonth: number;
  avgDaysToResolve: number | null;
}

// ========== 入力・リクエスト ==========

export interface CreateComplaintInput {
  title: string;
  description: string;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  requesterType: RequesterType;
  requesterName?: string | null;
  contactHint?: string | null;
  occurredAt?: string | null;
  dueAt?: string | null;
}

export interface UpdateComplaintInput {
  title?: string;
  description?: string;
  category?: ComplaintCategory;
  severity?: ComplaintSeverity;
  rootCause?: string | null;
  preventivePlan?: string | null;
  resolutionSummary?: string | null;
  occurredAt?: string | null;
}

export interface CreateComplaintActionInput {
  title: string;
  ownerUserId?: string | null;
  dueAt?: string | null;
}

export interface UpdateComplaintActionInput {
  title?: string;
  ownerUserId?: string | null;
  dueAt?: string | null;
}

export interface ListComplaintsFilter {
  status?: ComplaintStatus;
  severity?: ComplaintSeverity;
  category?: ComplaintCategory;
  overdue?: boolean;
  myAssigned?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

// ========== 権限チェック ==========

export interface ViewerContext {
  userId: string;
  role: AppRole;
}

/**
 * クレーム管理権限（全件閲覧・編集）
 * manager, executive, admin のみ
 */
export function canManageComplaints(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin'].includes(viewer.role);
}

/**
 * クレーム閲覧権限
 * manager+ または監査役、または担当者
 */
export function canViewComplaint(
  viewer: ViewerContext,
  complaint: Complaint
): boolean {
  if (canManageComplaints(viewer)) return true;
  if (viewer.role === 'auditor') return true;
  // 担当者は閲覧可
  if (complaint.assigneeUserId === viewer.userId) return true;
  return false;
}

/**
 * クレーム編集権限
 * manager+ または担当者（一部のみ）
 */
export function canEditComplaint(
  viewer: ViewerContext,
  complaint: Complaint
): boolean {
  if (canManageComplaints(viewer)) return true;
  // 担当者はステータス変更とコメント追加のみ
  return complaint.assigneeUserId === viewer.userId;
}

/**
 * 統計閲覧権限
 * manager, executive, admin, auditor
 */
export function canViewComplaintStats(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(viewer.role);
}

/**
 * オープンステータスかどうか
 */
export function isOpenStatus(status: ComplaintStatus): boolean {
  return !['resolved', 'closed', 'archived'].includes(status);
}
