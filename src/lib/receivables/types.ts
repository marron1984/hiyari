/**
 * 未収管理（Receivables）型定義
 *
 * 金銭情報を扱うため RBAC を厳格に設定
 */

// ユーザーロール
export type UserRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

// ========== 未収本体 ==========

/** 対象タイプ */
export type ReceivableSubjectType = 'client' | 'company' | 'other';

/** ステータス */
export type ReceivableStatus =
  | 'open'          // 未回収
  | 'in_collection' // 回収中
  | 'promised'      // 支払約束
  | 'partial'       // 一部入金
  | 'disputed'      // 係争中
  | 'paid'          // 完済
  | 'writeoff'      // 貸倒
  | 'archived';     // アーカイブ

/** 優先度 */
export type ReceivablePriority = 'normal' | 'high' | 'critical';

/** 次アクションタイプ */
export type NextActionType = 'call' | 'email' | 'visit' | 'letter' | 'other' | null;

/** 未収レコード */
export interface Receivable {
  id: string;

  // 事業単位（Task 049: 事業別財務集計用）
  businessUnitId: string | null;

  // 対象情報
  subjectType: ReceivableSubjectType;
  subjectId: string | null;
  subjectName: string;

  // 請求情報
  invoiceNo: string | null;
  period: string | null;
  description: string | null;

  // 金額情報
  amount: number;
  currency: string;

  // 日付情報
  issuedAt: string | null;
  dueAt: string;
  agingDays: number | null;

  // ステータス・優先度
  status: ReceivableStatus;
  priority: ReceivablePriority;

  // 担当情報
  ownerUserId: string | null;
  ownerRole: string | null;

  // 入金情報
  promisedAt: string | null;
  paidAmount: number | null;
  paidAt: string | null;

  // 次アクション
  riskNote: string | null;
  nextActionAt: string | null;
  nextActionType: NextActionType;

  // 監査
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

// ========== アクションログ ==========

/** アクションタイプ */
export type ReceivableActionType = 'call' | 'email' | 'visit' | 'letter' | 'sms' | 'other';

/** アウトカム */
export type ReceivableActionOutcome =
  | 'no_answer'
  | 'promised'
  | 'partial_paid'
  | 'paid'
  | 'disputed'
  | 'other'
  | null;

/** アクションログ */
export interface ReceivableAction {
  id: string;
  receivableId: string;
  actionType: ReceivableActionType;
  occurredAt: string;
  actorUserId: string | null;
  summary: string;
  detail: string | null;
  outcome: ReceivableActionOutcome;
  promisedAt: string | null;
  amountPaid: number | null;
  nextActionAt: string | null;
  note: string | null;
  createdAt: string;
}

// ========== 監査ログ ==========

/** 監査アクション */
export type ReceivableEventAction =
  | 'create'
  | 'update'
  | 'assign'
  | 'status_change'
  | 'add_action'
  | 'mark_paid'
  | 'writeoff';

/** 監査イベント */
export interface ReceivableEvent {
  id: string;
  receivableId: string;
  actorUserId: string;
  action: ReceivableEventAction;
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

export const RECEIVABLE_SUBJECT_TYPE_LABELS: Record<ReceivableSubjectType, string> = {
  client: '利用者',
  company: '法人',
  other: 'その他',
};

export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  open: '未回収',
  in_collection: '回収中',
  promised: '支払約束',
  partial: '一部入金',
  disputed: '係争中',
  paid: '完済',
  writeoff: '貸倒',
  archived: 'アーカイブ',
};

export const RECEIVABLE_STATUS_COLORS: Record<ReceivableStatus, string> = {
  open: 'bg-red-100 text-red-700',
  in_collection: 'bg-yellow-100 text-yellow-700',
  promised: 'bg-blue-100 text-blue-700',
  partial: 'bg-orange-100 text-orange-700',
  disputed: 'bg-purple-100 text-purple-700',
  paid: 'bg-green-100 text-green-700',
  writeoff: 'bg-zinc-100 text-zinc-700',
  archived: 'bg-zinc-50 text-zinc-500',
};

export const RECEIVABLE_PRIORITY_LABELS: Record<ReceivablePriority, string> = {
  normal: '通常',
  high: '高',
  critical: '緊急',
};

export const RECEIVABLE_PRIORITY_COLORS: Record<ReceivablePriority, string> = {
  normal: 'bg-zinc-100 text-zinc-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export const ACTION_TYPE_LABELS: Record<ReceivableActionType, string> = {
  call: '電話',
  email: 'メール',
  visit: '訪問',
  letter: '書面',
  sms: 'SMS',
  other: 'その他',
};

export const ACTION_OUTCOME_LABELS: Record<string, string> = {
  no_answer: '不在',
  promised: '約束取得',
  partial_paid: '一部入金',
  paid: '完済',
  disputed: '係争',
  other: 'その他',
};

export const NEXT_ACTION_TYPE_LABELS: Record<string, string> = {
  call: '電話',
  email: 'メール',
  visit: '訪問',
  letter: '書面',
  other: 'その他',
};

// ========== RBAC ==========

/**
 * 未収データを閲覧できるか
 * - manager以上: 全件閲覧可
 * - staff/leader: 担当分のみ（またはアクセス不可）
 */
export function canViewReceivables(role: UserRole): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(role);
}

/**
 * 未収データを編集できるか
 * - manager以上が編集可能
 */
export function canEditReceivables(role: UserRole): boolean {
  return ['manager', 'executive', 'admin'].includes(role);
}

/**
 * 未収を作成できるか
 * - manager以上推奨
 */
export function canCreateReceivables(role: UserRole): boolean {
  return ['manager', 'executive', 'admin'].includes(role);
}

/**
 * 貸倒処理できるか
 * - manager以上
 */
export function canWriteOff(role: UserRole): boolean {
  return ['manager', 'executive', 'admin'].includes(role);
}

/**
 * 担当割当できるか
 * - manager以上
 */
export function canAssignOwner(role: UserRole): boolean {
  return ['manager', 'executive', 'admin'].includes(role);
}

/**
 * 統計を閲覧できるか
 * - manager以上
 */
export function canViewStats(role: UserRole): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(role);
}

/**
 * 自分の担当分のみ閲覧可能か（staff/leaderの場合）
 */
export function isOwnAssignmentOnly(role: UserRole): boolean {
  return ['staff', 'leader'].includes(role);
}

// ========== ユーティリティ ==========

/**
 * 経過日数を計算
 */
export function calculateAgingDays(dueAt: string): number {
  const today = new Date();
  const due = new Date(dueAt);
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * 期限超過かどうか
 */
export function isOverdue(receivable: Receivable): boolean {
  if (['paid', 'writeoff', 'archived'].includes(receivable.status)) {
    return false;
  }
  const today = new Date().toISOString().split('T')[0];
  return receivable.dueAt < today;
}

/**
 * 金額フォーマット
 */
export function formatAmount(amount: number, currency: string = 'JPY'): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * 対象名マスク（PII保護）
 */
export function maskSubjectName(name: string): string {
  if (name.length <= 2) {
    return name[0] + '○';
  }
  return name[0] + '○'.repeat(name.length - 2) + name[name.length - 1];
}
