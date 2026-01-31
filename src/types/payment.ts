// ======== 支払い管理 型定義 ========

// ======== 支払いステータス ========
export type PaymentStatus =
  | 'pending'      // 承認待ち（支払い依頼作成済み）
  | 'approved'     // 承認済み（支払い実行待ち）
  | 'processing'   // 支払い処理中
  | 'completed'    // 支払い完了
  | 'failed'       // 支払い失敗
  | 'cancelled';   // キャンセル

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: '承認待ち',
  approved: '承認済み',
  processing: '処理中',
  completed: '完了',
  failed: '失敗',
  cancelled: 'キャンセル',
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-700' },
  processing: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  failed: { bg: 'bg-red-100', text: 'text-red-700' },
  cancelled: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
};

// ======== 支払い方法 ========
export type PaymentMethod = 'bank_transfer' | 'credit_card' | 'other';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'bank_transfer', label: '銀行振込' },
  { value: 'credit_card', label: 'クレジットカード' },
  { value: 'other', label: 'その他' },
];

// ======== 支払いプロバイダー ========
export type PaymentProviderType = 'dummy' | 'freee' | 'bank_api' | 'stripe';

// ======== 銀行口座情報 ========
export interface BankAccount {
  bankName: string;
  bankCode: string;
  branchName: string;
  branchCode: string;
  accountType: 'ordinary' | 'checking'; // 普通 / 当座
  accountNumber: string;
  accountHolder: string;
}

// ======== 支払い情報 ========
export interface Payment {
  id: string;
  tenantId: string;

  // 関連申請
  applicationId: string;
  applicationTitle: string;

  // 支払い情報
  amount: number;
  currency: string; // 'JPY'
  paymentMethod: PaymentMethod;

  // 振込先情報
  payeeName: string;
  payeeEmail?: string;
  bankAccount?: BankAccount;

  // ステータス
  status: PaymentStatus;

  // 処理情報
  providerType: PaymentProviderType;
  providerTransactionId?: string;

  // freee連携情報
  freeePaymentRequestId?: number;
  freeeTransferId?: number;
  freeePartnerId?: number;

  // 失敗情報
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  lastRetryAt?: Date;

  // 承認情報
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Date;

  // 完了情報
  completedAt?: Date;

  // 作成者
  createdBy: string;
  createdByName: string;

  // タイムスタンプ
  createdAt: Date;
  updatedAt: Date;
}

// ======== 支払い実行結果 ========
export interface PaymentExecutionResult {
  success: boolean;
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

// ======== 支払いプロバイダーインターフェース ========
export interface PaymentProviderInterface {
  /**
   * 支払いを実行
   */
  execute(payment: Payment): Promise<PaymentExecutionResult>;

  /**
   * 支払いステータスを確認
   */
  checkStatus(transactionId: string): Promise<PaymentStatus>;

  /**
   * プロバイダー名を取得
   */
  getName(): string;
}

// ======== 支払い依頼作成入力 ========
export interface CreatePaymentInput {
  applicationId: string;
  applicationTitle: string;
  amount: number;
  payeeName: string;
  payeeEmail?: string;
  paymentMethod: PaymentMethod;
  bankAccount?: BankAccount;
  createdBy: string;
  createdByName: string;
}
