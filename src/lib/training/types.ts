/**
 * 研修管理 型定義
 *
 * 研修の計画→実施→受講記録→証跡化
 */

import type { AppRole } from '@/config/appRoles';

/**
 * 研修カテゴリ
 */
export type TrainingCategory = 'safety' | 'compliance' | 'care' | 'it' | 'other';

/**
 * 研修頻度
 */
export type TrainingFrequency = 'once' | 'annual' | 'semiannual' | 'quarterly' | 'monthly';

/**
 * セッションステータス
 */
export type SessionStatus = 'planned' | 'done' | 'cancelled';

/**
 * 受講ステータス
 */
export type AttendanceStatus = 'assigned' | 'attended' | 'absent' | 'excused';

/**
 * 証跡タイプ
 */
export type EvidenceType = 'manual' | 'upload' | 'signature' | null;

/**
 * イベントエンティティタイプ
 */
export type TrainingEntityType = 'course' | 'session' | 'attendance';

/**
 * イベントアクション
 */
export type TrainingEventAction =
  | 'create'
  | 'update'
  | 'assign'
  | 'mark_attended'
  | 'mark_absent'
  | 'mark_excused'
  | 'cancel';

/**
 * 研修コース（マスタ）
 */
export interface TrainingCourse {
  id: string;
  title: string;
  description: string | null;
  category: TrainingCategory;
  frequency: TrainingFrequency;
  required: boolean;
  defaultDueDays: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 研修セッション（実施回）
 */
export interface TrainingSession {
  id: string;
  courseId: string;
  courseName?: string;
  name: string;
  scheduledAt: string;
  durationMinutes: number | null;
  location: string | null;
  instructorName: string | null;
  notes: string | null;
  status: SessionStatus;
  createdByUserId: string;
  createdByUserName?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 対象者割当
 */
export interface TrainingAssignment {
  id: string;
  sessionId: string;
  userId: string;
  userName?: string;
  dueAt: string | null;
  assignedAt: string;
  assignedByUserId: string | null;
}

/**
 * 受講記録
 */
export interface TrainingAttendance {
  id: string;
  sessionId: string;
  userId: string;
  userName?: string;
  attendedAt: string | null;
  status: AttendanceStatus;
  evidenceType: EvidenceType;
  evidenceNote: string | null;
  recordedByUserId: string | null;
  recordedByUserName?: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 研修イベント（監査ログ）
 */
export interface TrainingEvent {
  id: string;
  entityType: TrainingEntityType;
  entityId: string;
  actorUserId: string | null;
  actorUserName?: string | null;
  action: TrainingEventAction;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
  note: string | null;
}

/**
 * セッション統計
 */
export interface SessionStats {
  targetCount: number;
  attendedCount: number;
  absentCount: number;
  excusedCount: number;
  overdueCount: number;
  attendedRate: number;
}

/**
 * 自分の研修サマリー
 */
export interface MyTrainingSummary {
  pendingCount: number;
  overdueCount: number;
  completedThisYear: number;
  pending: TrainingAttendance[];
  overdue: TrainingAttendance[];
  recentCompleted: TrainingAttendance[];
}

/**
 * ビューアーコンテキスト
 */
export interface ViewerContext {
  userId: string;
  role: AppRole;
}

/**
 * カテゴリ表示設定
 */
export const TRAINING_CATEGORY_CONFIG: Record<
  TrainingCategory,
  { label: string; icon: string; color: string; bg: string }
> = {
  safety: { label: '安全', icon: '🛡️', color: 'text-red-700', bg: 'bg-red-50' },
  compliance: { label: 'コンプライアンス', icon: '📋', color: 'text-blue-700', bg: 'bg-blue-50' },
  care: { label: '介護技術', icon: '🤲', color: 'text-green-700', bg: 'bg-green-50' },
  it: { label: 'IT', icon: '💻', color: 'text-purple-700', bg: 'bg-purple-50' },
  other: { label: 'その他', icon: '📚', color: 'text-zinc-700', bg: 'bg-zinc-50' },
};

/**
 * 頻度表示設定
 */
export const TRAINING_FREQUENCY_CONFIG: Record<TrainingFrequency, { label: string }> = {
  once: { label: '一回限り' },
  annual: { label: '年次' },
  semiannual: { label: '半年毎' },
  quarterly: { label: '四半期毎' },
  monthly: { label: '月次' },
};

/**
 * セッションステータス表示設定
 */
export const SESSION_STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; color: string; bg: string }
> = {
  planned: { label: '予定', color: 'text-blue-700', bg: 'bg-blue-50' },
  done: { label: '完了', color: 'text-green-700', bg: 'bg-green-50' },
  cancelled: { label: '中止', color: 'text-zinc-500', bg: 'bg-zinc-100' },
};

/**
 * 受講ステータス表示設定
 */
export const ATTENDANCE_STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; color: string; bg: string; emoji: string }
> = {
  assigned: { label: '未受講', color: 'text-yellow-700', bg: 'bg-yellow-50', emoji: '⏳' },
  attended: { label: '受講済', color: 'text-green-700', bg: 'bg-green-50', emoji: '✅' },
  absent: { label: '欠席', color: 'text-red-700', bg: 'bg-red-50', emoji: '❌' },
  excused: { label: '免除', color: 'text-zinc-600', bg: 'bg-zinc-100', emoji: '➖' },
};

/**
 * 権限チェック：研修管理可能か
 */
export function canManageTraining(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin'].includes(viewer.role);
}

/**
 * 権限チェック：全体統計閲覧可能か
 */
export function canViewAllStats(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(viewer.role);
}

// ========== Task 054: スコープ付き統計 ==========

/**
 * 研修統計（スコープ対応）
 */
export interface TrainingStats {
  overdueCount: number;          // 期限超過の受講記録数
  sessionsDoneThisWeek: number;  // 今週完了したセッション数
  assignedOpenCount: number;     // 未受講（assigned）の件数
}

/**
 * 統計取得オプション
 */
export interface TrainingStatsOptions {
  orgUnitIds?: string[];  // フィルタ対象の組織ID（ユーザー所属ベース）
}
