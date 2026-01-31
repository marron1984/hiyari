// ======== AI副社長・日次違和感レポート型定義 ========

/**
 * 日次KPIデータ
 */
export interface DailyKpi {
  id?: string;
  tenantId: string;
  date: string; // YYYY-MM-DD
  baseId: string;
  // KPI指標
  occupancyRate: number;           // 稼働率（%）
  revenue: number;                  // 売上
  laborCost: number;                // 人件費
  overtimeApplicationsCount: number; // 残業申請件数
  expenseApplicationsCount: number;  // 経費申請件数
  complaintsCount: number;          // クレーム件数
  absencesCount: number;            // 欠勤件数
  tardiesCount: number;             // 遅刻件数
  // メタデータ
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * KPI指標名
 */
export type KpiMetric =
  | 'occupancyRate'
  | 'revenue'
  | 'laborCost'
  | 'overtimeApplicationsCount'
  | 'expenseApplicationsCount'
  | 'complaintsCount'
  | 'absencesCount'
  | 'tardiesCount';

/**
 * 比較タイプ
 */
export type CompareType =
  | 'vs7daysAgo'       // 7日前と比較
  | 'vs7dayAvg'        // 直近7日平均と比較
  | 'vsAllBasesAvg';   // 全拠点平均と比較

/**
 * KPI差分（アラート判定用）
 */
export interface KpiDiff {
  baseId: string;
  baseName: string;
  metric: KpiMetric;
  metricLabel: string;
  currentValue: number;
  compareValue: number;
  changePct: number;      // 変化率（%）
  compare: CompareType;
  alertLevel: 'normal' | 'attention' | 'warning';
}

/**
 * 違和感レポート
 */
export interface AnomalyReport {
  id?: string;
  tenantId: string;
  date: string;           // レポート対象日（YYYY-MM-DD）
  generatedAt: Date;      // 生成日時
  // アラートレベル
  overallLevel: 'normal' | 'attention' | 'warning' | 'priority';
  // 検出された異常
  diffs: KpiDiff[];
  // AI生成レポート
  aiReport: {
    summary: string;      // サマリー
    hypotheses: string[]; // 仮説（最大3つ）
    checkPoints: string[]; // 確認先（最大3つ）
    rawResponse?: string; // AI生のレスポンス
  };
  // メタデータ
  createdAt?: Date;
}

/**
 * AI入力用のJSON構造
 */
export interface AnomalyReportInput {
  date: string;
  bases: Array<{ baseId: string; baseName: string }>;
  kpi: DailyKpi[];
  diffs: Array<{
    baseId: string;
    baseName: string;
    metric: string;
    metricLabel: string;
    currentValue: number;
    compareValue: number;
    changePct: number;
    compare: CompareType;
  }>;
}

/**
 * KPI指標ラベル
 */
export const KPI_METRIC_LABELS: Record<KpiMetric, string> = {
  occupancyRate: '稼働率',
  revenue: '売上',
  laborCost: '人件費',
  overtimeApplicationsCount: '残業申請件数',
  expenseApplicationsCount: '経費申請件数',
  complaintsCount: 'クレーム件数',
  absencesCount: '欠勤件数',
  tardiesCount: '遅刻件数',
};

/**
 * アラート閾値
 */
export const ALERT_THRESHOLDS = {
  attention: 10,  // 10%以上の変化で注意
  warning: 20,    // 20%以上の変化で警戒
  priorityCount: 3, // 3指標以上で優先
};
