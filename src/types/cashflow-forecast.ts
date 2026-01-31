// ======== キャッシュフロー予測 型定義 ========

// ======== 予測対象期間 ========
export type ForecastPeriod = '1week' | '2weeks' | '1month' | '3months';

// ======== 支払い予定 ========
export interface ScheduledPayment {
  id: string;
  applicationId: string;
  applicationTitle: string;
  payeeName: string;
  amount: number;
  dueDate?: string;          // 支払い予定日（YYYY-MM-DD）
  approvedAt: string;        // 承認日
  status: 'approved' | 'pending_payment';
  priority: 'high' | 'medium' | 'low';
  category?: string;         // カテゴリ（家賃、給与、仕入など）
}

// ======== 日別予測 ========
export interface DailyForecast {
  date: string;              // YYYY-MM-DD
  dayOfWeek: number;         // 0-6 (日-土)

  // 支出予測
  outflow: {
    scheduled: number;       // 確定済み支出
    estimated: number;       // 推定支出（過去傾向から）
    total: number;
  };

  // 収入予測（将来実装用）
  inflow: {
    scheduled: number;
    estimated: number;
    total: number;
  };

  // 残高予測
  balance: {
    opening: number;         // 期首残高
    closing: number;         // 期末残高
    minimum: number;         // 最低残高
  };

  // 支払い詳細
  payments: ScheduledPayment[];
}

// ======== キャッシュフロー予測 ========
export interface CashflowForecast {
  tenantId: string;
  period: ForecastPeriod;
  startDate: string;
  endDate: string;

  // 現在の状況
  currentBalance: number;    // 現在残高（入力値または推定値）

  // 日別予測
  dailyForecasts: DailyForecast[];

  // サマリー
  summary: {
    totalOutflow: number;
    totalInflow: number;
    netCashflow: number;
    minimumBalance: number;
    minimumBalanceDate: string;
    daysWithNegativeBalance: number;
  };

  // 承認済み・未払いの内訳
  pendingPayments: {
    total: number;
    count: number;
    byCategory: Array<{
      category: string;
      amount: number;
      count: number;
    }>;
    byDueDate: Array<{
      date: string;
      amount: number;
      count: number;
    }>;
  };

  // 生成日時
  generatedAt: Date;
}

// ======== キャッシュフローAIレビュー ========
export interface CashflowAIReview {
  id: string;
  tenantId: string;
  period: ForecastPeriod;
  startDate: string;
  endDate: string;

  // 予測データスナップショット
  forecast: CashflowForecast;

  // リスク検知
  risks: Array<{
    type: 'negative_balance' | 'low_balance' | 'large_outflow' | 'concentration';
    severity: 'critical' | 'warning' | 'info';
    date?: string;
    amount?: number;
    message: string;
  }>;
  hasRisks: boolean;
  riskSummary: {
    critical: number;
    warning: number;
    info: number;
  };

  // AI分析結果
  aiAnalysis?: {
    summary: string;           // 全体要約
    keyPoints: string[];       // 重要ポイント
    concerns: string[];        // 注意点・リスク
    recommendations: string[]; // 推奨アクション（支払い優先順位など）
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
export const CASHFLOW_AI_REVIEWS_COLLECTION = 'cashflow_ai_reviews';

// リスク検知閾値
export const CASHFLOW_THRESHOLDS = {
  // 残高警告ライン
  LOW_BALANCE_WARNING: 1000000,    // 100万円
  LOW_BALANCE_CRITICAL: 500000,   // 50万円

  // 大型支出（1日あたり）
  LARGE_OUTFLOW_WARNING: 5000000,  // 500万円
  LARGE_OUTFLOW_CRITICAL: 10000000, // 1000万円

  // 集中度（1日の支出が月間の何%を超えるか）
  CONCENTRATION_WARNING: 20,      // 20%
  CONCENTRATION_CRITICAL: 40,     // 40%
};

// デフォルト予測期間
export const DEFAULT_FORECAST_PERIOD: ForecastPeriod = '1month';
