// ======== 月次決算AIチェック 型定義 ========

// ======== 異常検知ルール ========
export interface AnomalyRule {
  id: string;
  name: string;
  description: string;
  category: 'balance' | 'trend' | 'ratio' | 'compliance' | 'timing';
  severity: 'critical' | 'warning' | 'info';
  check: (data: MonthlyClosingData) => AnomalyResult | null;
}

// ======== 異常検知結果 ========
export interface AnomalyResult {
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  details?: {
    expected?: number | string;
    actual?: number | string;
    difference?: number;
    percentage?: number;
  };
}

// ======== 月次決算データ ========
export interface MonthlyClosingData {
  tenantId: string;
  yearMonth: string; // YYYY-MM

  // 売上・収入
  revenue: {
    total: number;
    breakdown: Array<{
      category: string;
      amount: number;
    }>;
    previousMonth?: number;
    previousYear?: number;
  };

  // 費用・支出
  expenses: {
    total: number;
    breakdown: Array<{
      accountItemId: number;
      accountItemName: string;
      amount: number;
    }>;
    previousMonth?: number;
    previousYear?: number;
  };

  // 支払い関連
  payments: {
    approved: number;      // 承認済み総額
    completed: number;     // 支払い完了総額
    pending: number;       // 未払い総額
    failed: number;        // 失敗総額
    count: {
      approved: number;
      completed: number;
      pending: number;
      failed: number;
    };
  };

  // 申請関連
  applications: {
    submitted: number;
    approved: number;
    rejected: number;
    pending: number;
  };

  // 勘定科目別集計
  accountItems: Array<{
    accountItemId: number;
    accountItemName: string;
    debitTotal: number;
    creditTotal: number;
    balance: number;
    transactionCount: number;
  }>;

  // 取引先別集計
  partners: Array<{
    payeeName: string;
    totalAmount: number;
    transactionCount: number;
    averageAmount: number;
  }>;

  // 集計日時
  aggregatedAt: Date;
}

// ======== 月次決算AIレビュー ========
export interface MonthlyAIReview {
  id: string;
  tenantId: string;
  yearMonth: string;

  // 集計データスナップショット
  closingData: MonthlyClosingData;

  // ルールベース異常検知結果
  anomalies: AnomalyResult[];
  hasAnomalies: boolean;
  anomalySummary: {
    critical: number;
    warning: number;
    info: number;
  };

  // AI分析結果
  aiAnalysis?: {
    summary: string;           // 全体要約
    keyPoints: string[];       // 重要ポイント
    concerns: string[];        // 注意点
    recommendations: string[]; // 推奨アクション
    model: string;
    tokensUsed: number;
  };

  // ステータス
  status: 'draft' | 'reviewed' | 'acknowledged';
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Date;
  reviewNote?: string;

  // タイムスタンプ
  createdAt: Date;
  updatedAt: Date;
}

// ======== 定数 ========
export const MONTHLY_AI_REVIEWS_COLLECTION = 'monthly_ai_reviews';

// 異常検知閾値
export const ANOMALY_THRESHOLDS = {
  // 前月比変動率（%）
  REVENUE_CHANGE_WARNING: 20,
  REVENUE_CHANGE_CRITICAL: 50,
  EXPENSE_CHANGE_WARNING: 30,
  EXPENSE_CHANGE_CRITICAL: 100,

  // 前年同月比変動率（%）
  YOY_CHANGE_WARNING: 30,
  YOY_CHANGE_CRITICAL: 100,

  // 未払い比率（%）
  UNPAID_RATIO_WARNING: 30,
  UNPAID_RATIO_CRITICAL: 50,

  // 失敗支払い比率（%）
  FAILED_RATIO_WARNING: 5,
  FAILED_RATIO_CRITICAL: 10,

  // 単一取引先集中度（%）
  PARTNER_CONCENTRATION_WARNING: 30,
  PARTNER_CONCENTRATION_CRITICAL: 50,
};
