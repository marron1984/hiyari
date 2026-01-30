// ======== 共通申請モジュール 型定義 ========
// 稟議（RINGI）・経費申請（EXPENSE）・残業申請（OVERTIME）の共通基盤

import { UserRole } from './index';
import { RingiStatus, RingiCategory, PaymentMethod, ApproverType, ApproverRole } from './ringi';

// ======== 申請種別 ========
export type ApplicationType = 'RINGI' | 'EXPENSE' | 'OVERTIME';

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  RINGI: '稟議',
  EXPENSE: '経費申請',
  OVERTIME: '残業申請',
};

export const APPLICATION_TYPE_ICONS: Record<ApplicationType, string> = {
  RINGI: '📋',
  EXPENSE: '💰',
  OVERTIME: '⏰',
};

// ======== 経費申請 Payload ========
export type ExpenseCategory =
  | '交通費'
  | '宿泊費'
  | '会議費'
  | '交際費'
  | '通信費'
  | '消耗品費'
  | '備品購入'
  | '研修費'
  | '医療費'
  | 'その他';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  '交通費',
  '宿泊費',
  '会議費',
  '交際費',
  '通信費',
  '消耗品費',
  '備品購入',
  '研修費',
  '医療費',
  'その他',
];

export type ExpensePaymentMethod = '立替' | '仮払' | '法人カード' | '請求書払い';

export const EXPENSE_PAYMENT_METHODS: ExpensePaymentMethod[] = [
  '立替',
  '仮払',
  '法人カード',
  '請求書払い',
];

export interface ExpensePayload {
  expenseDate: string; // YYYY-MM-DD
  amount: number;
  category: ExpenseCategory;
  paymentMethod: ExpensePaymentMethod;
  description: string;
  receiptUrls: string[];
  // オプション項目
  vendor?: string; // 支払先
  taxAmount?: number; // 税額
  purpose?: string; // 利用目的
  participants?: string[]; // 同席者（会議費・交際費）
  projectCode?: string; // プロジェクトコード
}

export interface ExpenseFormData {
  expenseDate: string;
  amount: number | '';
  category: ExpenseCategory | '';
  paymentMethod: ExpensePaymentMethod | '';
  description: string;
  receiptUrls: string[];
  vendor?: string;
  taxAmount?: number | '';
  purpose?: string;
  participants?: string;
  projectCode?: string;
}

// ======== 残業申請 Payload ========
export type OvertimeReason =
  | '業務繁忙'
  | '締め切り対応'
  | '緊急対応'
  | '会議・打合せ'
  | '利用者対応'
  | '研修・教育'
  | 'その他';

export const OVERTIME_REASONS: OvertimeReason[] = [
  '業務繁忙',
  '締め切り対応',
  '緊急対応',
  '会議・打合せ',
  '利用者対応',
  '研修・教育',
  'その他',
];

export interface OvertimePayload {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  hours: number; // 計算値
  reason: OvertimeReason;
  reasonDetail?: string; // 詳細理由
  workContent?: string; // 作業内容
  isHoliday: boolean; // 休日出勤
  isNightShift: boolean; // 深夜帯
}

export interface OvertimeFormData {
  date: string;
  startTime: string;
  endTime: string;
  reason: OvertimeReason | '';
  reasonDetail?: string;
  workContent?: string;
  isHoliday: boolean;
  isNightShift: boolean;
}

// ======== 共通申請データ ========
export interface Application<T = unknown> {
  id: string;
  tenantId: string;
  branchId: string;

  // 申請種別
  type: ApplicationType;

  // 申請者
  authorId: string;
  authorName: string;

  // 件名（自動生成 or 入力）
  title: string;

  // 種別固有のペイロード
  payload: T;

  // 状態
  status: RingiStatus;

  // 金額（集計用・経費は必須、残業は時給計算用）
  amount?: number;

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

  // 承認フロー
  approvalFlow?: ApplicationApprovalFlow;

  // タイムスタンプ
  submittedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

// 経費申請型
export type ExpenseApplication = Application<ExpensePayload>;

// 残業申請型
export type OvertimeApplication = Application<OvertimePayload>;

// ======== 承認フロー（共通）========

export interface ApplicationApprovalFlow {
  applicationId: string;
  routeId: string;
  routeName: string;
  currentStepOrder: number;
  steps: ApplicationApprovalFlowStep[];
  completedAt?: Date;
}

export interface ApplicationApprovalFlowStep {
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

// ======== 承認経路（種別対応）========

export interface ApprovalRoute {
  id: string;
  tenantId: string;
  name: string;
  description?: string;

  // 適用条件
  applicationType: ApplicationType | null; // nullは全種別
  category: RingiCategory | ExpenseCategory | null; // nullは全カテゴリ
  branchId: string | null; // nullは全拠点
  branchName?: string;
  minAmount: number | null;
  maxAmount: number | null;

  // 設定
  isActive: boolean;
  isDefault: boolean;
  priority: number;

  // ステップ
  steps: ApprovalRouteStep[];

  // メタ
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  createdByName: string;
}

export interface ApprovalRouteStep {
  id: string;
  routeId: string;
  stepOrder: number;
  approverType: ApproverType;
  approverValue: string;
  approverName?: string;
  required: boolean;
  createdAt: Date;
}

// ======== 監査ログ ========

export type ApplicationAction = 'create' | 'update' | 'submit' | 'approve' | 'reject' | 'return' | 'withdraw';

export interface ApplicationAuditLog {
  id: string;
  tenantId: string;
  applicationId: string;
  applicationType: ApplicationType;
  action: ApplicationAction;
  fromStatus?: RingiStatus;
  toStatus?: RingiStatus;
  performedBy: string;
  performedByName: string;
  comment?: string;
  createdAt: Date;
}

// ======== バリデーション ========

export interface ApplicationValidationError {
  field: string;
  message: string;
}

export interface ApplicationValidationResult {
  isValid: boolean;
  errors: ApplicationValidationError[];
  warnings: string[];
}

/**
 * 経費申請のバリデーション
 */
export function validateExpense(data: ExpenseFormData): ApplicationValidationResult {
  const errors: ApplicationValidationError[] = [];
  const warnings: string[] = [];

  if (!data.expenseDate) {
    errors.push({ field: 'expenseDate', message: '経費発生日は必須です' });
  }
  if (data.amount === '' || data.amount === undefined || data.amount === null) {
    errors.push({ field: 'amount', message: '金額は必須です' });
  } else if (data.amount <= 0) {
    errors.push({ field: 'amount', message: '金額は1円以上で入力してください' });
  }
  if (data.category === '' || !data.category) {
    errors.push({ field: 'category', message: 'カテゴリは必須です' });
  }
  if (data.paymentMethod === '' || !data.paymentMethod) {
    errors.push({ field: 'paymentMethod', message: '支払方法は必須です' });
  }
  if (!data.description?.trim()) {
    errors.push({ field: 'description', message: '内容は必須です' });
  }

  // 金額が一定以上の場合は領収書推奨
  if (typeof data.amount === 'number' && data.amount >= 3000 && data.receiptUrls.length === 0) {
    warnings.push('3,000円以上の経費には領収書添付を推奨します');
  }

  // 会議費・交際費は参加者推奨
  if (['会議費', '交際費'].includes(data.category as string) && !data.participants?.trim()) {
    warnings.push('会議費・交際費は同席者の記載を推奨します');
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * 残業申請のバリデーション
 */
export function validateOvertime(data: OvertimeFormData): ApplicationValidationResult {
  const errors: ApplicationValidationError[] = [];
  const warnings: string[] = [];

  if (!data.date) {
    errors.push({ field: 'date', message: '日付は必須です' });
  }
  if (!data.startTime) {
    errors.push({ field: 'startTime', message: '開始時間は必須です' });
  }
  if (!data.endTime) {
    errors.push({ field: 'endTime', message: '終了時間は必須です' });
  }
  if (data.reason === '' || !data.reason) {
    errors.push({ field: 'reason', message: '残業理由は必須です' });
  }

  // 時間の妥当性チェック
  if (data.startTime && data.endTime) {
    const start = data.startTime.split(':').map(Number);
    const end = data.endTime.split(':').map(Number);
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];

    if (endMinutes <= startMinutes) {
      errors.push({ field: 'endTime', message: '終了時間は開始時間より後にしてください' });
    }

    const hours = (endMinutes - startMinutes) / 60;
    if (hours > 8) {
      warnings.push('残業時間が8時間を超えています');
    }
  }

  // 理由が「その他」の場合は詳細必須
  if (data.reason === 'その他' && !data.reasonDetail?.trim()) {
    errors.push({ field: 'reasonDetail', message: '「その他」の場合は詳細理由を入力してください' });
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * 残業時間を計算
 */
export function calculateOvertimeHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;

  const start = startTime.split(':').map(Number);
  const end = endTime.split(':').map(Number);
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];

  if (endMinutes <= startMinutes) return 0;

  const hours = (endMinutes - startMinutes) / 60;
  return Math.round(hours * 100) / 100; // 小数点2桁
}

// ======== 権限チェック ========

/**
 * 申請の作成者かどうか
 */
export function isApplicationAuthor(application: Application, userId: string): boolean {
  return application.authorId === userId;
}

/**
 * 編集可能かどうか（draft状態 and 作成者）
 */
export function canEditApplication(application: Application, userId: string): boolean {
  return application.status === 'draft' && isApplicationAuthor(application, userId);
}

/**
 * 削除可能かどうか（draft状態 and 作成者）
 */
export function canDeleteApplication(application: Application, userId: string): boolean {
  return application.status === 'draft' && isApplicationAuthor(application, userId);
}

/**
 * 承認可能かどうか
 */
export function canApproveApplication(
  application: Application,
  userId: string,
  userRole: UserRole,
  userBranchId: string
): boolean {
  if (application.status !== 'submitted') return false;

  // admin以上は全件承認可能
  if (userRole === 'admin' || userRole === 'system_admin') {
    return true;
  }

  // leaderは自事業所のみ
  if (userRole === 'leader' && userBranchId === application.branchId) {
    return true;
  }

  return false;
}

// ======== ヘルパー ========

/**
 * 申請のタイトルを自動生成
 */
export function generateApplicationTitle(
  type: ApplicationType,
  payload: ExpensePayload | OvertimePayload,
  authorName: string
): string {
  switch (type) {
    case 'EXPENSE': {
      const ep = payload as ExpensePayload;
      return `【経費】${ep.category} ${ep.amount.toLocaleString()}円（${authorName}）`;
    }
    case 'OVERTIME': {
      const op = payload as OvertimePayload;
      return `【残業】${op.date} ${op.hours}h（${authorName}）`;
    }
    default:
      return `【申請】${authorName}`;
  }
}

/**
 * ステータスに応じた色を取得（ringiと共通）
 */
export const APPLICATION_STATUS_COLORS: Record<RingiStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
  submitted: { bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
  returned: { bg: 'bg-orange-100', text: 'text-orange-700' },
};

export const APPLICATION_STATUS_LABELS: Record<RingiStatus, string> = {
  draft: '下書き',
  submitted: '承認待ち',
  approved: '承認済',
  rejected: '却下',
  returned: '差戻し',
};
