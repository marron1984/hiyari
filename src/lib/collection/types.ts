/**
 * 回収フロー（Collection Flow）型定義
 *
 * 未収オペの標準化のためのフロー管理
 */

// ユーザーロール
export type UserRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

// ========== テンプレート ==========

/** 対象タイプ */
export type CollectionSubjectType = 'client' | 'company' | 'other' | null;

/** アクションタイプ */
export type CollectionActionType = 'call' | 'sms' | 'email' | 'letter' | 'visit' | 'other';

/** 期待される結果 */
export type ExpectedOutcome = 'promised' | 'partial' | 'paid' | 'disputed' | 'none' | null;

/** 重要度 */
export type StepSeverity = 'info' | 'warning' | 'critical';

/** 回収フローテンプレート */
export interface CollectionFlowTemplate {
  id: string;
  name: string;
  subjectType: CollectionSubjectType;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

/** 回収フローステップ */
export interface CollectionFlowStep {
  id: string;
  templateId: string;
  stepOrder: number;
  actionType: CollectionActionType;
  dueDaysAfterPrevious: number;
  messageTemplate: string | null;
  expectedOutcome: ExpectedOutcome;
  severity: StepSeverity;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ========== 割当・実行 ==========

/** 割当ステータス */
export type AssignmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';

/** 未収×フロー割当 */
export interface ReceivableFlowAssignment {
  id: string;
  receivableId: string;
  templateId: string;
  assignedAt: string;
  assignedByUserId: string | null;
  currentStepOrder: number;
  status: AssignmentStatus;
  updatedAt: string;
}

/** ステップログステータス */
export type StepLogStatus = 'pending' | 'done' | 'skipped' | 'failed';

/** ステップ結果 */
export type StepOutcome = 'no_answer' | 'promised' | 'partial_paid' | 'paid' | 'disputed' | 'other' | null;

/** 実行ログ */
export interface ReceivableFlowStepLog {
  id: string;
  receivableId: string;
  templateId: string;
  stepOrder: number;
  plannedDueAt: string;
  status: StepLogStatus;
  doneAt: string | null;
  doneByUserId: string | null;
  outcome: StepOutcome;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// ========== 監査ログ ==========

/** エンティティタイプ */
export type CollectionEntityType = 'template' | 'assignment' | 'step_log';

/** イベントアクション */
export type CollectionEventAction =
  | 'create'
  | 'update'
  | 'assign'
  | 'pause'
  | 'resume'
  | 'complete_step'
  | 'skip_step';

/** 監査イベント */
export interface CollectionEvent {
  id: string;
  entityType: CollectionEntityType;
  entityId: string;
  actorUserId: string;
  action: CollectionEventAction;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
  note: string | null;
}

// ========== ビューアーコンテキスト ==========

export interface ViewerContext {
  userId: string;
  role: UserRole;
}

// ========== ラベル ==========

export const COLLECTION_ACTION_TYPE_LABELS: Record<CollectionActionType, string> = {
  call: '電話',
  sms: 'SMS',
  email: 'メール',
  letter: '書面',
  visit: '訪問',
  other: 'その他',
};

export const EXPECTED_OUTCOME_LABELS: Record<string, string> = {
  promised: '約束取得',
  partial: '一部入金',
  paid: '完済',
  disputed: '係争',
  none: 'なし',
};

export const STEP_SEVERITY_LABELS: Record<StepSeverity, string> = {
  info: '通常',
  warning: '注意',
  critical: '緊急',
};

export const STEP_SEVERITY_COLORS: Record<StepSeverity, string> = {
  info: 'bg-zinc-100 text-zinc-700',
  warning: 'bg-yellow-100 text-yellow-700',
  critical: 'bg-red-100 text-red-700',
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  active: '実行中',
  paused: '一時停止',
  completed: '完了',
  cancelled: 'キャンセル',
};

export const ASSIGNMENT_STATUS_COLORS: Record<AssignmentStatus, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-zinc-100 text-zinc-700',
};

export const STEP_LOG_STATUS_LABELS: Record<StepLogStatus, string> = {
  pending: '未実施',
  done: '完了',
  skipped: 'スキップ',
  failed: '失敗',
};

export const STEP_LOG_STATUS_COLORS: Record<StepLogStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-700',
  done: 'bg-green-100 text-green-700',
  skipped: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

export const STEP_OUTCOME_LABELS: Record<string, string> = {
  no_answer: '不在',
  promised: '約束取得',
  partial_paid: '一部入金',
  paid: '完済',
  disputed: '係争',
  other: 'その他',
};

// ========== RBAC ==========

/**
 * テンプレートを管理できるか
 */
export function canManageTemplates(role: UserRole): boolean {
  return ['manager', 'admin'].includes(role);
}

/**
 * フローを閲覧できるか
 */
export function canViewCollectionFlow(role: UserRole): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(role);
}

/**
 * フロー割当できるか
 */
export function canAssignFlow(role: UserRole): boolean {
  return ['manager', 'admin'].includes(role);
}

/**
 * ステップを実行できるか（owner or manager+）
 */
export function canExecuteStep(role: UserRole): boolean {
  return ['manager', 'admin'].includes(role);
}

/**
 * 統計を閲覧できるか
 */
export function canViewStats(role: UserRole): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(role);
}

// ========== ユーティリティ ==========

/**
 * 日付を加算
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * 期限超過かどうか
 */
export function isStepOverdue(stepLog: ReceivableFlowStepLog): boolean {
  if (stepLog.status !== 'pending') return false;
  const today = new Date().toISOString().split('T')[0];
  return stepLog.plannedDueAt < today;
}

/**
 * 超過日数を計算
 */
export function calculateOverdueDays(plannedDueAt: string): number {
  const today = new Date();
  const due = new Date(plannedDueAt);
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}
