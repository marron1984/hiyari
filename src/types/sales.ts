// ======== 営業進捗管理システムの型定義 ========

// 営業担当者（固定メンバー）
export const SALES_ASSIGNEES = [
  '吉田',
  '藤原',
  '生田',
  '力久',
  '鳥羽',
  '福岡',
] as const;

export type SalesAssignee = typeof SALES_ASSIGNEES[number] | 'その他';

// 営業先タイプ
export type SalesAccountType = 'MSW' | '仲介会社' | 'ケアマネ' | 'その他';

export const SALES_ACCOUNT_TYPES: SalesAccountType[] = [
  'MSW',
  '仲介会社',
  'ケアマネ',
  'その他',
];

// 案件ステータス
export type SalesDealStatus =
  | 'テレアポ'
  | '資料送付'
  | '面談'
  | '担当者決定'
  | '入居相談'
  | '入居契約'
  | '入居確認'
  | '請求書到着'
  | '失注'
  | '保留';

export const SALES_DEAL_STATUSES: SalesDealStatus[] = [
  'テレアポ',
  '資料送付',
  '面談',
  '担当者決定',
  '入居相談',
  '入居契約',
  '入居確認',
  '請求書到着',
];

// パイプライン順序（進捗計算用）
export const SALES_DEAL_STATUS_ORDER: Record<SalesDealStatus, number> = {
  'テレアポ': 1,
  '資料送付': 2,
  '面談': 3,
  '担当者決定': 4,
  '入居相談': 5,
  '入居契約': 6,
  '入居確認': 7,
  '請求書到着': 8,
  '失注': -1,
  '保留': 0,
};

// ステータス設定（色など）
export const SALES_DEAL_STATUS_CONFIG: Record<SalesDealStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  'テレアポ': { label: 'テレアポ', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  '資料送付': { label: '資料送付', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  '面談': { label: '面談', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  '担当者決定': { label: '担当者決定', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  '入居相談': { label: '入居相談', color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  '入居契約': { label: '入居契約', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  '入居確認': { label: '入居確認', color: 'text-teal-700', bgColor: 'bg-teal-100' },
  '請求書到着': { label: '請求書到着', color: 'text-green-700', bgColor: 'bg-green-100' },
  '失注': { label: '失注', color: 'text-red-700', bgColor: 'bg-red-100' },
  '保留': { label: '保留', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
};

// 介護度（prospect.tsから再利用可能だが、独立性のため定義）
export type CareLevel =
  | '要支援1'
  | '要支援2'
  | '要介護1'
  | '要介護2'
  | '要介護3'
  | '要介護4'
  | '要介護5'
  | '自立'
  | '申請中'
  | '不明';

export const CARE_LEVELS: CareLevel[] = [
  '自立',
  '要支援1',
  '要支援2',
  '要介護1',
  '要介護2',
  '要介護3',
  '要介護4',
  '要介護5',
  '申請中',
  '不明',
];

// ======== 営業先（SalesAccount） ========

export interface SalesAccount {
  id: string;
  tenantId: string;

  // 基本情報
  name: string;                    // 会社名/施設名
  type: SalesAccountType;          // タイプ（MSW/仲介会社/ケアマネ）
  phone?: string;                  // 電話番号
  email?: string;                  // メールアドレス
  address?: string;                // 住所

  // 担当者情報（先方）
  contactPerson?: string;          // 担当者名
  contactPhone?: string;           // 担当者電話
  contactEmail?: string;           // 担当者メール

  // 自社担当
  assignedToId?: string;           // 担当営業ID
  assignedToName?: string;         // 担当営業名

  // メモ
  notes?: string;

  // 統計（自動更新）
  totalDeals?: number;             // 総案件数
  activeDeals?: number;            // 進行中案件数
  completedDeals?: number;         // 成約数

  // メタ
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
  createdByName?: string;
}

// 営業先作成フォーム
export interface SalesAccountFormData {
  name: string;
  type: SalesAccountType;
  phone?: string;
  email?: string;
  address?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  assignedToId?: string;
  assignedToName?: string;
  notes?: string;
}

// ======== 案件（SalesDeal） ========

// ステータス変更履歴
export interface StatusHistoryEntry {
  status: SalesDealStatus;
  changedAt: Date;
  changedBy: string;
  changedByName: string;
  note?: string;
}

// ADL情報
export interface ADLInfo {
  standing?: string;     // 立位
  bathing?: string;      // 入浴
  eating?: string;       // 食事
  toileting?: string;    // 排泄
  mobility?: string;     // 移動
  communication?: string; // コミュニケーション
  other?: string;        // その他
}

export interface SalesDeal {
  id: string;
  tenantId: string;

  // 営業先への参照
  accountId: string;
  accountName?: string;            // 非正規化（表示用）

  // ステータス
  status: SalesDealStatus;
  statusHistory: StatusHistoryEntry[];

  // 自社担当
  assignedToId?: string;
  assignedToName?: string;

  // 入居者情報
  residentName?: string;           // 入居者名
  residentAge?: number;            // 年齢
  residentGender?: '男性' | '女性' | '不明';
  careLevel?: CareLevel;           // 介護度
  adl?: ADLInfo;                   // ADL情報
  adlSummary?: string;             // ADL概要（テキスト）

  // 入居情報
  targetBranchId?: string;         // 入居先事業所ID
  targetBranchName?: string;       // 入居先事業所名
  expectedMoveInDate?: string;     // 入居予定日
  actualMoveInDate?: string;       // 実際の入居日

  // 請求情報
  invoiceDate?: string;            // 請求書到着日
  invoiceAmount?: number;          // 請求金額

  // メモ
  notes?: string;

  // 通知
  lastNotifiedAt?: Date;           // 最終通知日時

  // prospectとの連携（オプション）
  prospectId?: string;             // 連携するprospect ID

  // 流入元（CV率計算用）
  source?: 'テレアポ' | '資料送付' | 'その他';

  // フォローアップ管理
  followUpCount?: number;          // フォローアップ回数（1=初回、2=2回目...）
  lastFollowUpDate?: string;       // 最終フォローアップ日
  nextFollowUpDate?: string;       // 次回フォローアップ予定日
  followUpHistory?: {              // フォローアップ履歴
    count: number;
    date: string;
    note?: string;
    result?: '継続' | '成約' | '保留' | '失注';
  }[];

  // メタ
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
  createdByName?: string;
}

// 案件作成フォーム
export interface SalesDealFormData {
  accountId: string;
  accountName?: string;            // 新規営業先名（accountIdが空の場合に使用）
  accountType?: SalesAccountType;  // 新規営業先タイプ
  status: SalesDealStatus;
  assignedToId?: string;
  assignedToName?: string;
  residentName?: string;
  residentAge?: number;
  residentGender?: '男性' | '女性' | '不明';
  careLevel?: CareLevel;
  adl?: ADLInfo;
  adlSummary?: string;
  targetBranchId?: string;
  targetBranchName?: string;
  expectedMoveInDate?: string;
  notes?: string;
  source?: 'テレアポ' | '資料送付' | 'その他';
  nextFollowUpDate?: string;
}

// 流入元タイプ
export type DealSource = 'テレアポ' | '資料送付' | 'その他';
export const DEAL_SOURCES: DealSource[] = ['テレアポ', '資料送付', 'その他'];

// ======== 集計・レポート用 ========

// パイプライン集計
export interface PipelineSummary {
  status: SalesDealStatus;
  count: number;
  deals: SalesDeal[];
}

// 営業成績
export interface SalesPerformance {
  userId: string;
  userName: string;
  period: string;                  // YYYY-MM
  newDeals: number;                // 新規案件数
  completedDeals: number;          // 成約数
  lostDeals: number;               // 失注数
  conversionRate: number;          // 成約率
}

// 月次レポート
export interface MonthlySalesReport {
  period: string;                  // YYYY-MM
  totalNewDeals: number;
  totalCompletedDeals: number;
  totalLostDeals: number;
  byAccount: {
    accountId: string;
    accountName: string;
    accountType: SalesAccountType;
    deals: number;
    completed: number;
  }[];
  byAssignee: SalesPerformance[];
  pipelineSummary: PipelineSummary[];
}

// ======== 通知設定 ========

export const SALES_NOTIFICATION_TRIGGERS: SalesDealStatus[] = [
  '面談',
  '入居契約',
  '入居確認',
  '請求書到着',
];

// 停滞アラート日数
export const STALE_DEAL_DAYS: Record<SalesDealStatus, number> = {
  'テレアポ': 7,
  '資料送付': 5,
  '面談': 7,
  '担当者決定': 14,
  '入居相談': 14,
  '入居契約': 7,
  '入居確認': 3,
  '請求書到着': 30,
  '失注': 999,
  '保留': 30,
};
