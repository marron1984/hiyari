// ======== freee連携 型定義 ========

// ======== OAuth トークン ========
export interface FreeeToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType: string;
  scope: string;
}

// ======== 連携設定（Firestore保存用） ========
export interface FreeeIntegration {
  id: string;
  tenantId: string;

  // 接続状態
  connected: boolean;
  connectedAt?: Date;
  connectedBy?: string;
  connectedByName?: string;

  // 事業所情報
  companyId?: number;
  companyName?: string;

  // トークン（暗号化推奨、ダミーでは平文）
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;

  // 最終同期
  lastSyncAt?: Date;
  lastError?: string;

  // タイムスタンプ
  createdAt: Date;
  updatedAt: Date;
}

// ======== freee事業所 ========
export interface FreeeCompany {
  id: number;
  name: string;
  nameKana?: string;
  displayName?: string;
  role?: string;
}

// ======== freee口座 ========
export interface FreeeWalletable {
  id: number;
  name: string;
  type: 'bank_account' | 'credit_card' | 'wallet';
  walletableBalance?: number;
}

// ======== freee取引先 ========
export interface FreeePartner {
  id: number;
  name: string;
  code?: string;
  shortcut1?: string;
  shortcut2?: string;
  longName?: string;
  countryCode?: string;
}

// ======== freee支払依頼（経費精算・支払依頼） ========
export interface FreeePaymentRequest {
  id?: number;
  companyId: number;
  title: string;
  applicantId?: number;
  applicationDate: string; // YYYY-MM-DD
  description?: string;
  targetDate?: string; // 支払期日
  totalAmount: number;
  status?: FreeePaymentRequestStatus;

  // 取引先
  partnerId?: number;
  partnerName?: string;
  partnerCode?: string;

  // 支払い情報
  paymentMethod?: 'bank_transfer' | 'cash' | 'other';

  // 添付ファイル
  receiptIds?: number[];
}

export type FreeePaymentRequestStatus =
  | 'draft'           // 下書き
  | 'in_progress'     // 申請中
  | 'approved'        // 承認済み
  | 'rejected'        // 却下
  | 'feedback'        // 差戻し
  | 'settled'         // 精算済み
  | 'closed';         // 完了

// ======== freee振込依頼 ========
export interface FreeeTransfer {
  id?: number;
  companyId: number;

  // 送金元
  fromWalletableId: number;
  fromWalletableType: 'bank_account';

  // 送金先
  toWalletableId?: number; // freee登録口座の場合
  // または外部口座
  toAccountName?: string;
  toAccountNumber?: string;
  toBankCode?: string;
  toBranchCode?: string;
  toAccountType?: 'ordinary' | 'checking';

  // 金額・日付
  amount: number;
  transferDate: string; // YYYY-MM-DD
  description?: string;
}

// ======== freee API レスポンス ========
export interface FreeeApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
}

// ======== freee支払い実行結果 ========
export interface FreeePaymentResult {
  success: boolean;
  freeePaymentRequestId?: number;
  freeeTransferId?: number;
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

// ======== freee OAuth 設定 ========
export interface FreeeOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
}

// デフォルトのOAuth設定
export const FREEE_OAUTH_CONFIG: Omit<FreeeOAuthConfig, 'clientId' | 'clientSecret' | 'redirectUri'> = {
  authorizeUrl: 'https://accounts.secure.freee.co.jp/public_api/authorize',
  tokenUrl: 'https://accounts.secure.freee.co.jp/public_api/token',
  apiBaseUrl: 'https://api.freee.co.jp',
};

// ======== 定数 ========
export const FREEE_SCOPES = [
  'read',
  'write',
].join(' ');

export const FREEE_INTEGRATION_COLLECTION = 'integrations';
export const FREEE_INTEGRATION_DOC_ID = 'freee';
