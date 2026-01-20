// ======== 稟議モジュール 型定義 ========

import { UserRole } from './index';

// 稟議ステータス
export type RingiStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

// 稟議カテゴリ
export type RingiCategory =
  | '備品購入'
  | '設備修繕'
  | '人事関連'
  | '研修・教育'
  | '契約・外注'
  | 'その他';

export const RINGI_CATEGORIES: RingiCategory[] = [
  '備品購入',
  '設備修繕',
  '人事関連',
  '研修・教育',
  '契約・外注',
  'その他',
];

// ステータス表示ラベル
export const RINGI_STATUS_LABELS: Record<RingiStatus, string> = {
  draft: '下書き',
  submitted: '承認待ち',
  approved: '承認済',
  rejected: '却下',
};

// ステータス表示色
export const RINGI_STATUS_COLORS: Record<RingiStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
  submitted: { bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
};

// ======== 状態遷移ルール ========

/**
 * 状態遷移マトリクス
 * - draft → submitted: 作成者のみ
 * - submitted → approved: leader(同一事業所)/admin/system_admin
 * - submitted → rejected: leader(同一事業所)/admin/system_admin
 * - submitted → draft: 作成者のみ（取り下げ）
 * - approved/rejected: 変更不可
 */
export const RINGI_TRANSITIONS: Record<RingiStatus, RingiStatus[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected', 'draft'],
  approved: [],
  rejected: [],
};

/**
 * 各アクションに必要な権限
 */
export type RingiAction = 'submit' | 'approve' | 'reject' | 'withdraw' | 'edit';

export interface TransitionRule {
  from: RingiStatus;
  to: RingiStatus;
  action: RingiAction;
  allowedBy: 'author' | 'approver';
}

export const TRANSITION_RULES: TransitionRule[] = [
  { from: 'draft', to: 'submitted', action: 'submit', allowedBy: 'author' },
  { from: 'submitted', to: 'approved', action: 'approve', allowedBy: 'approver' },
  { from: 'submitted', to: 'rejected', action: 'reject', allowedBy: 'approver' },
  { from: 'submitted', to: 'draft', action: 'withdraw', allowedBy: 'author' },
];

// ======== 稟議データ ========

export interface Ringi {
  id: string;
  tenantId: string;
  branchId: string;
  // 申請者
  authorId: string;
  authorName: string;
  // 内容
  title: string;
  category: RingiCategory;
  amount?: number;           // 金額（任意）
  description: string;       // 申請理由・詳細
  attachmentUrls?: string[]; // 添付ファイルURL
  // 状態
  status: RingiStatus;
  // 承認情報
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Date;
  approvalComment?: string;
  // 却下情報
  rejectedBy?: string;
  rejectedByName?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  // タイムスタンプ
  submittedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

// ======== フォーム入力値 ========

export interface RingiFormData {
  title: string;
  category: RingiCategory;
  amount?: number;
  description: string;
  attachments?: File[];
}

// ======== 監査ログ ========

export interface RingiAuditLog {
  id: string;
  tenantId: string;
  ringiId: string;
  action: RingiAction | 'create' | 'update';
  fromStatus?: RingiStatus;
  toStatus?: RingiStatus;
  performedBy: string;
  performedByName: string;
  comment?: string;
  createdAt: Date;
}

// ======== 権限チェックヘルパー ========

/**
 * 作成者かどうかをチェック
 */
export function isAuthor(ringi: Ringi, userId: string): boolean {
  return ringi.authorId === userId;
}

/**
 * 編集可能かどうかをチェック
 * - draft状態かつ作成者のみ編集可能
 */
export function canEdit(ringi: Ringi, userId: string): boolean {
  return ringi.status === 'draft' && isAuthor(ringi, userId);
}

/**
 * 状態遷移が可能かチェック
 */
export function canTransition(
  ringi: Ringi,
  action: RingiAction,
  userId: string,
  userRole: UserRole,
  userBranchId: string
): boolean {
  const rule = TRANSITION_RULES.find((r) => r.action === action);
  if (!rule) return false;
  if (ringi.status !== rule.from) return false;

  if (rule.allowedBy === 'author') {
    return isAuthor(ringi, userId);
  }

  if (rule.allowedBy === 'approver') {
    // admin以上は全件承認可能
    if (userRole === 'admin' || userRole === 'system_admin') {
      return true;
    }
    // leaderは自事業所のみ
    if (userRole === 'leader' && userBranchId === ringi.branchId) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * 削除可能かどうかをチェック
 * - draft状態かつ作成者のみ削除可能
 */
export function canDelete(ringi: Ringi, userId: string): boolean {
  return ringi.status === 'draft' && isAuthor(ringi, userId);
}
