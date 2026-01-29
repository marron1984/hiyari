// ======== 稟議モジュール 型定義 ========

import { UserRole } from './index';

// 稟議ステータス
export type RingiStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'returned';

// 緊急度
export type RingiUrgency = '通常' | '至急';

// 支払方法
export type PaymentMethod = '振込' | '口座振替' | 'カード' | '現金' | 'その他';

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
  returned: '差戻し',
};

// ステータス表示色
export const RINGI_STATUS_COLORS: Record<RingiStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
  submitted: { bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
  returned: { bg: 'bg-orange-100', text: 'text-orange-700' },
};

// カテゴリ別必須添付
export const REQUIRED_ATTACHMENTS_BY_CATEGORY: Record<RingiCategory, string[]> = {
  '備品購入': ['見積書'],
  '設備修繕': ['見積書'],
  '人事関連': [],
  '研修・教育': [],
  '契約・外注': ['見積書', '契約書案'],
  'その他': [],
};

// 差戻し理由テンプレート
export const RETURN_REASON_TEMPLATES = [
  '見積書が不足しています',
  '支払先情報が不足しています',
  '背景・理由の記載が不足しています',
  '比較検討（相見積もり）が必要です',
  '契約書案を添付してください',
  '金額の内訳を明記してください',
];

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
  submitted: ['approved', 'rejected', 'returned', 'draft'],
  approved: [],
  rejected: [],
  returned: ['submitted', 'draft'], // 差戻し後は再申請または下書きに戻す
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

  // Step 1: 概要
  title: string;
  category: RingiCategory;
  urgency?: RingiUrgency;
  desiredDecisionDate?: Date;

  // Step 2: 内容（背景と目的）
  background?: string;       // 背景（なぜ）
  purpose?: string;          // 目的（何を）
  expectedEffect?: string;  // 期待効果（どう良くなる）
  risk?: string;            // リスク・懸念

  // Step 3: 金額と支払い
  amount?: number;
  payeeName?: string;       // 支払先
  paymentMethod?: PaymentMethod;
  desiredPayDate?: Date;    // 希望支払日
  accountCode?: string;     // 勘定科目
  department?: string;      // 部門

  // Step 4: 添付
  attachments?: RingiAttachment[];

  // 旧フィールド（互換性維持）
  description?: string;     // 旧：申請理由・詳細
  attachmentUrls?: string[];

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

  // 差戻し情報
  returnedBy?: string;
  returnedByName?: string;
  returnedAt?: Date;
  returnReason?: string;

  // タイムスタンプ
  submittedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

// 稟議添付ファイル
export interface RingiAttachment {
  id: string;
  type: 'QUOTE' | 'CONTRACT_DRAFT' | 'OTHER'; // 見積書/契約書案/その他
  fileName: string;
  fileUrl: string;
  fileMime?: string;
  fileSize?: number;
  uploadedAt: Date;
}

// ======== フォーム入力値 ========

export interface RingiFormData {
  // Step 1: 概要
  title: string;
  category: RingiCategory;
  urgency?: RingiUrgency;          // オプショナル（後方互換）
  desiredDecisionDate?: string;

  // Step 2: 内容
  background?: string;             // オプショナル（後方互換）
  purpose?: string;                // オプショナル（後方互換）
  expectedEffect?: string;
  risk?: string;

  // Step 3: 金額と支払い
  amount?: number;
  payeeName?: string;
  paymentMethod?: PaymentMethod;
  desiredPayDate?: string;
  accountCode?: string;
  department?: string;

  // Step 4: 添付
  attachments?: RingiAttachment[];

  // 旧フィールド（互換性）
  description?: string;
}

// ======== バリデーション ========

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Step 1: 概要のバリデーション
 */
export function validateStep1(data: RingiFormData): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data.title?.trim()) {
    errors.push({ field: 'title', message: '件名は必須です' });
  }
  if (!data.category) {
    errors.push({ field: 'category', message: 'カテゴリは必須です' });
  }

  return { isValid: errors.length === 0, errors, warnings: [] };
}

/**
 * Step 2: 内容のバリデーション
 */
export function validateStep2(data: RingiFormData): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data.background?.trim()) {
    errors.push({ field: 'background', message: '背景（なぜ必要か）は必須です' });
  }
  if (!data.purpose?.trim()) {
    errors.push({ field: 'purpose', message: '目的（何をするか）は必須です' });
  }

  return { isValid: errors.length === 0, errors, warnings: [] };
}

/**
 * Step 3: 金額と支払いのバリデーション
 */
export function validateStep3(data: RingiFormData): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (data.amount === undefined || data.amount === null) {
    errors.push({ field: 'amount', message: '金額は必須です' });
  }

  // カテゴリによって支払先が必須
  if (['備品購入', '設備修繕', '契約・外注'].includes(data.category)) {
    if (!data.payeeName?.trim()) {
      warnings.push('支払先を入力すると承認がスムーズです');
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Step 4: 添付のバリデーション（カテゴリ別必須チェック）
 */
export function validateStep4(data: RingiFormData): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  const requiredTypes = REQUIRED_ATTACHMENTS_BY_CATEGORY[data.category] || [];
  const attachedTypes: string[] = (data.attachments || []).map((a) => {
    if (a.type === 'QUOTE') return '見積書';
    if (a.type === 'CONTRACT_DRAFT') return '契約書案';
    return 'その他';
  });

  for (const required of requiredTypes) {
    if (!attachedTypes.includes(required)) {
      errors.push({ field: 'attachments', message: `${required}が必要です` });
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * 全ステップのバリデーション
 */
export function validateAllSteps(data: RingiFormData): ValidationResult {
  const step1 = validateStep1(data);
  const step2 = validateStep2(data);
  const step3 = validateStep3(data);
  const step4 = validateStep4(data);

  return {
    isValid: step1.isValid && step2.isValid && step3.isValid && step4.isValid,
    errors: [...step1.errors, ...step2.errors, ...step3.errors, ...step4.errors],
    warnings: [...step1.warnings, ...step2.warnings, ...step3.warnings, ...step4.warnings],
  };
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

// ======== 承認経路 ========

/**
 * 承認者タイプ
 * - ROLE: ロールベース（manager, leader, admin, exec）
 * - USER: 特定ユーザー指定
 */
export type ApproverType = 'ROLE' | 'USER';

/**
 * ロール承認者の種類
 */
export type ApproverRole = 'manager' | 'leader' | 'admin' | 'exec';

export const APPROVER_ROLE_LABELS: Record<ApproverRole, string> = {
  manager: '部門長',
  leader: '拠点長',
  admin: '管理者',
  exec: '経営層',
};

/**
 * 承認ステップ
 */
export interface RingiApprovalRouteStep {
  id: string;
  routeId: string;
  stepOrder: number;
  approverType: ApproverType;
  approverValue: string; // ROLEの場合はApproverRole、USERの場合はuserId
  approverName?: string; // USER指定時の表示名
  required: boolean;
  createdAt: Date;
}

/**
 * 承認経路
 */
export interface RingiApprovalRoute {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category: RingiCategory | null; // nullは全カテゴリ
  branchId: string | null; // nullは全拠点
  branchName?: string;
  minAmount: number | null; // nullは下限なし
  maxAmount: number | null; // nullは上限なし
  isActive: boolean;
  isDefault: boolean; // デフォルト経路フラグ
  priority: number; // マッチング優先度（低い方が優先）
  steps: RingiApprovalRouteStep[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  createdByName: string;
}

/**
 * 稟議に紐づく承認フロー（実行時）
 */
export interface RingiApprovalFlow {
  ringiId: string;
  routeId: string;
  routeName: string;
  currentStepOrder: number;
  steps: RingiApprovalFlowStep[];
  completedAt?: Date;
}

export interface RingiApprovalFlowStep {
  stepOrder: number;
  approverType: ApproverType;
  approverValue: string;
  approverName?: string;
  required: boolean;
  status: 'pending' | 'approved' | 'skipped';
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Date;
  comment?: string;
}

/**
 * 承認経路フォームデータ
 */
export interface RingiApprovalRouteFormData {
  name: string;
  description?: string;
  category: RingiCategory | '';
  branchId: string;
  minAmount: number | '';
  maxAmount: number | '';
  isActive: boolean;
  priority: number;
  steps: Array<{
    approverType: ApproverType;
    approverValue: string;
    required: boolean;
  }>;
}

/**
 * 金額条件のラベル表示
 */
export function formatAmountCondition(min: number | null, max: number | null): string {
  if (min === null && max === null) return '金額制限なし';
  if (min === null) return `${max?.toLocaleString()}円以下`;
  if (max === null) return `${min.toLocaleString()}円以上`;
  return `${min.toLocaleString()}円 〜 ${max.toLocaleString()}円`;
}
