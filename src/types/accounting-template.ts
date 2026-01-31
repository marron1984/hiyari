// ======== 仕訳テンプレート 型定義 ========

import type { PaymentMethod } from './payment';

// ======== 勘定科目（freee用） ========
export interface AccountItem {
  accountItemId: number;       // freee勘定科目ID
  accountItemName: string;     // 勘定科目名（表示用）
  taxCode?: number;            // 税区分コード
}

// ======== 仕訳明細 ========
export interface JournalEntryDetail {
  entryType: 'debit' | 'credit';  // 借方/貸方
  accountItem: AccountItem;
  amount?: number;                 // 固定金額（nullの場合は支払金額を使用）
  amountPercentage?: number;       // 金額の割合（%）
  partnerId?: number;              // freee取引先ID
  itemId?: number;                 // freee品目ID
  sectionId?: number;              // freee部門ID
  tagIds?: number[];               // freeeタグID
  description?: string;            // 備考
}

// ======== マッチング条件 ========
export interface TemplateMatchCondition {
  // 支払方法
  paymentMethods?: PaymentMethod[];

  // 金額範囲
  amountMin?: number;
  amountMax?: number;

  // 部署（branchId）
  branchIds?: string[];

  // 支払い目的キーワード
  purposeKeywords?: string[];

  // 取引先名キーワード
  payeeKeywords?: string[];
}

// ======== 摘要テンプレート ========
export interface DescriptionTemplate {
  // テンプレート文字列
  // 利用可能な変数: {payeeName}, {amount}, {date}, {purpose}, {invoiceNumber}
  template: string;

  // 例: "{date} {payeeName}への支払い（{purpose}）"
}

// ======== 仕訳テンプレート ========
export interface AccountingTemplate {
  id: string;
  tenantId: string;

  // 基本情報
  name: string;                    // テンプレート名
  description?: string;            // 説明

  // マッチング条件
  matchCondition: TemplateMatchCondition;

  // 優先度（高いほど優先）
  priority: number;

  // 仕訳明細（借方・貸方）
  entries: JournalEntryDetail[];

  // 摘要テンプレート
  descriptionTemplate: DescriptionTemplate;

  // freee連携設定
  freeeSettings?: {
    walletableId?: number;         // 決済口座ID
    walletableType?: 'bank_account' | 'credit_card' | 'wallet';
  };

  // 有効/無効
  isActive: boolean;

  // メタデータ
  createdBy?: string;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ======== テンプレートマッチング結果 ========
export interface TemplateMatchResult {
  matched: boolean;
  template?: AccountingTemplate;
  reason?: string;                 // マッチしなかった理由
}

// ======== 仕訳データ（freee連携用） ========
export interface JournalEntry {
  // 取引日
  issueDate: string;               // YYYY-MM-DD

  // 仕訳タイプ
  type: 'income' | 'expense' | 'transfer';

  // 取引先
  partnerId?: number;
  partnerName?: string;

  // 明細
  details: Array<{
    accountItemId: number;
    taxCode?: number;
    amount: number;
    description?: string;
    itemId?: number;
    sectionId?: number;
    tagIds?: number[];
  }>;

  // 決済情報
  payments?: Array<{
    amount: number;
    fromWalletableId: number;
    fromWalletableType: 'bank_account' | 'credit_card' | 'wallet';
    date: string;
  }>;

  // 摘要
  description?: string;
}

// ======== 入力型 ========
export interface CreateAccountingTemplateInput {
  name: string;
  description?: string;
  matchCondition: TemplateMatchCondition;
  priority: number;
  entries: JournalEntryDetail[];
  descriptionTemplate: DescriptionTemplate;
  freeeSettings?: AccountingTemplate['freeeSettings'];
  isActive?: boolean;
}

export interface UpdateAccountingTemplateInput {
  name?: string;
  description?: string;
  matchCondition?: TemplateMatchCondition;
  priority?: number;
  entries?: JournalEntryDetail[];
  descriptionTemplate?: DescriptionTemplate;
  freeeSettings?: AccountingTemplate['freeeSettings'];
  isActive?: boolean;
}

// ======== 定数 ========
export const ACCOUNTING_TEMPLATES_COLLECTION = 'accounting_templates';

// よく使う勘定科目（freeeデフォルト）
export const COMMON_ACCOUNT_ITEMS: AccountItem[] = [
  { accountItemId: 101, accountItemName: '現金' },
  { accountItemId: 102, accountItemName: '普通預金' },
  { accountItemId: 103, accountItemName: '当座預金' },
  { accountItemId: 201, accountItemName: '買掛金' },
  { accountItemId: 202, accountItemName: '未払金' },
  { accountItemId: 203, accountItemName: '未払費用' },
  { accountItemId: 301, accountItemName: '仕入高' },
  { accountItemId: 302, accountItemName: '外注費' },
  { accountItemId: 303, accountItemName: '消耗品費' },
  { accountItemId: 304, accountItemName: '通信費' },
  { accountItemId: 305, accountItemName: '旅費交通費' },
  { accountItemId: 306, accountItemName: '接待交際費' },
  { accountItemId: 307, accountItemName: '広告宣伝費' },
  { accountItemId: 308, accountItemName: '支払手数料' },
  { accountItemId: 309, accountItemName: '地代家賃' },
  { accountItemId: 310, accountItemName: '水道光熱費' },
  { accountItemId: 311, accountItemName: '租税公課' },
  { accountItemId: 312, accountItemName: '給料手当' },
  { accountItemId: 313, accountItemName: '福利厚生費' },
  { accountItemId: 314, accountItemName: '雑費' },
];

// 税区分コード（freee）
export const TAX_CODES = {
  TAXABLE_10: 1,           // 課税売上10%
  TAXABLE_8: 2,            // 課税売上8%（軽減税率）
  TAX_FREE: 3,             // 非課税
  NOT_TAXABLE: 4,          // 不課税
  PURCHASE_TAXABLE_10: 5,  // 課税仕入10%
  PURCHASE_TAXABLE_8: 6,   // 課税仕入8%（軽減税率）
  PURCHASE_TAX_FREE: 7,    // 非課税仕入
  PURCHASE_NOT_TAXABLE: 8, // 不課税仕入
};
