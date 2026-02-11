/**
 * 委員会管理 型定義
 *
 * 委員会（種別）と開催回、議事録を管理
 * 参加者・決定事項・是正タスク（アクション）を記録し、追跡
 */

import type { AppRole } from '@/config/appRoles';

// ========== カテゴリ・周期・ステータス ==========

/** 委員会カテゴリ */
export type CommitteeCategory = 'safety' | 'quality' | 'compliance' | 'other';

export const COMMITTEE_CATEGORY_LABELS: Record<CommitteeCategory, string> = {
  safety: '安全',
  quality: '品質',
  compliance: '法令遵守',
  other: 'その他',
};

/** 開催周期 */
export type CommitteeCadence = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'adhoc';

export const COMMITTEE_CADENCE_LABELS: Record<CommitteeCadence, string> = {
  monthly: '毎月',
  quarterly: '四半期',
  semiannual: '半期',
  annual: '年次',
  adhoc: '随時',
};

/** 開催ステータス */
export type MeetingStatus = 'planned' | 'held' | 'cancelled';

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  planned: '予定',
  held: '開催済み',
  cancelled: '中止',
};

/** 出欠ステータス */
export type AttendanceStatus = 'present' | 'absent' | 'excused';

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: '出席',
  absent: '欠席',
  excused: '委任・免除',
};

/** メンバー役割 */
export type MemberRole = 'chair' | 'member' | 'observer';

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  chair: '委員長',
  member: '委員',
  observer: 'オブザーバー',
};

/** アクションステータス */
export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export const ACTION_ITEM_STATUS_LABELS: Record<ActionItemStatus, string> = {
  open: '未着手',
  in_progress: '対応中',
  done: '完了',
  cancelled: '取消',
};

// ========== エンティティ ==========

/** 委員会マスタ */
export interface Committee {
  id: string;
  name: string;
  category: CommitteeCategory;
  required: boolean; // 法定/必須か
  cadence: CommitteeCadence;
  defaultDueDayOfMonth: number | null; // 毎月X日までに開催（任意）
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 委員会メンバー */
export interface CommitteeMember {
  id: string;
  committeeId: string;
  userId: string;
  role: MemberRole | null;
  createdAt: string;
}

/** 開催回 */
export interface CommitteeMeeting {
  id: string;
  committeeId: string;
  committeeName?: string; // API enrichment
  title: string; // 例: 2026年2月 定例
  scheduledAt: string; // 予定日時
  heldAt: string | null; // 実際の開催日（終わったら入れる）
  location: string | null;
  status: MeetingStatus;
  attendeeCount?: number; // 出席者数（集計値）
  createdByUserId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 出欠 */
export interface CommitteeAttendance {
  id: string;
  meetingId: string;
  userId: string;
  status: AttendanceStatus | null;
  createdAt: string;
}

/** 議事録 */
export interface CommitteeMinutes {
  id: string;
  meetingId: string;
  summary: string; // 要点（短く）
  discussion: string | null; // 詳細（長文OK）
  decisions: string | null; // 決定事項（箇条書き想定）
  risks: string | null; // リスク/課題
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** アクション項目（是正・宿題） */
export interface CommitteeActionItem {
  id: string;
  meetingId: string;
  title: string;
  description: string | null;
  ownerUserId: string | null; // 担当者
  ownerRole: string | null; // 任意：role割当
  dueAt: string | null;
  status: ActionItemStatus;
  createdAt: string;
  updatedAt: string;
}

/** 監査ログ */
export interface CommitteeEvent {
  id: string;
  entityType: 'committee' | 'meeting' | 'minutes' | 'action_item';
  entityId: string;
  actorUserId: string | null;
  action:
    | 'create'
    | 'update'
    | 'status_change'
    | 'assign'
    | 'mark_done'
    | 'cancel';
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
  note: string | null;
}

// ========== 統計・サマリー ==========

/** 委員会サマリー（一覧表示用） */
export interface CommitteeSummary {
  committee: Committee;
  lastHeldAt: string | null; // 直近開催日
  nextScheduledAt: string | null; // 次回予定
  openActionCount: number; // 未完了アクション件数
  overdueActionCount: number; // 期限超過アクション件数
}

/** 開催統計 */
export interface MeetingStats {
  attendeeCount: number;
  presentCount: number;
  actionOpenCount: number;
  actionOverdueCount: number;
}

/** 委員会リスク情報 */
export interface CommitteeCadenceRisk {
  committeeId: string;
  committeeName: string;
  cadence: CommitteeCadence;
  required: boolean;
  lastHeldAt: string | null;
  expectedNextBy: string; // 次回開催期限（推定）
  daysOverdue: number; // 超過日数（0なら問題なし）
}

/** 期限超過アクション */
export interface OverdueActionItem extends CommitteeActionItem {
  committeeName: string;
  meetingTitle: string;
  daysOverdue: number;
}

// ========== 入力・リクエスト ==========

export interface CreateCommitteeInput {
  name: string;
  category: CommitteeCategory;
  required?: boolean;
  cadence: CommitteeCadence;
  defaultDueDayOfMonth?: number | null;
  description?: string | null;
}

export interface UpdateCommitteeInput {
  name?: string;
  category?: CommitteeCategory;
  required?: boolean;
  cadence?: CommitteeCadence;
  defaultDueDayOfMonth?: number | null;
  description?: string | null;
  isActive?: boolean;
}

export interface CreateMeetingInput {
  committeeId: string;
  title: string;
  scheduledAt: string;
  location?: string | null;
  notes?: string | null;
}

export interface UpdateMeetingInput {
  title?: string;
  scheduledAt?: string;
  heldAt?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface UpsertMinutesInput {
  summary: string;
  discussion?: string | null;
  decisions?: string | null;
  risks?: string | null;
}

export interface CreateActionItemInput {
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  ownerRole?: string | null;
  dueAt?: string | null;
}

export interface UpdateActionItemInput {
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
  ownerRole?: string | null;
  dueAt?: string | null;
}

// ========== 権限チェック ==========

export interface ViewerContext {
  userId: string;
  role: AppRole;
}

/**
 * 委員会管理権限（作成・編集・削除）
 * manager, executive, admin のみ
 */
export function canManageCommittees(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin'].includes(viewer.role);
}

/**
 * 全体統計閲覧権限
 * manager, executive, admin, auditor
 */
export function canViewAllCommitteeStats(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(viewer.role);
}

/**
 * アクション項目の更新権限（担当者または管理者）
 */
export function canUpdateActionItem(
  viewer: ViewerContext,
  actionItem: CommitteeActionItem
): boolean {
  if (canManageCommittees(viewer)) return true;
  return actionItem.ownerUserId === viewer.userId;
}
