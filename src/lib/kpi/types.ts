/**
 * KPI データ型定義
 *
 * KPI異常検知システム用の型定義
 */

// KPIデータポイント
export type KPIDataPoint = {
  date: string; // YYYY-MM-DD
  value: number | null;
};

// KPI時系列データ
export type KPITimeSeries = {
  kpiId: string;
  points: KPIDataPoint[]; // 昇順
};

// KPI計測頻度
export type KPIFrequency = 'daily' | 'weekly';

// KPIメタデータ
export type KPIMetadata = {
  id: string;
  name: string;
  description: string;
  unit: string; // %, 件, 人, 円 など
  category: KPICategory;
  direction: 'higher_is_better' | 'lower_is_better';
  frequency: KPIFrequency;
  isExternalAllowed: boolean; // 外部共有で表示可能か
  // 閾値設定
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  // ダッシュボードリンク
  dashboardPath?: string;
  createdAt?: string;
};

// KPIハイライト（ダッシュボード用）
export type KPIHighlight = {
  kpiId: string;
  name: string;
  currentValue: number | null;
  previousValue: number | null;
  unit: string;
  changePercent: number | null;
  trend: 'up' | 'down' | 'flat';
  status: 'good' | 'warning' | 'critical' | 'neutral';
  category: KPICategory;
  dashboardPath?: string;
};

// KPIサマリー統計
export type KPISummary = {
  total: number;
  withData: number;
  externalAllowed: number;
  byCategory: Record<string, number>;
};

// KPIカテゴリ
export type KPICategory =
  | 'sales' // 営業
  | 'operation' // 業務
  | 'people' // 人・組織
  | 'finance' // 財務
  | 'risk' // リスク
  | 'quality'; // 品質

// 異常タイプ
export type AnomalyType =
  | 'spike' // 急上昇
  | 'drop' // 急降下
  | 'threshold_warning' // 閾値警告
  | 'threshold_critical' // 閾値超過
  | 'missing_data' // データ欠損
  | 'zero_value' // ゼロ値（通常ゼロでないKPIの場合）
  | 'trend_change'; // トレンド変化

// 異常検知結果
export type AnomalyDetectionResult = {
  kpiId: string;
  kpiName: string;
  anomalyType: AnomalyType;
  severity: 'info' | 'warning' | 'critical';
  currentValue: number | null;
  previousValue: number | null;
  changePercent: number | null;
  threshold?: number;
  message: string;
  detectedAt: Date;
  dashboardPath?: string;
};

// アラート設定
export type AlertConfig = {
  kpiId: string;
  enabled: boolean;
  // 変動検知設定
  spikeThresholdPercent: number; // 急上昇と判定する変動率（%）
  dropThresholdPercent: number; // 急降下と判定する変動率（%）
  // 閾値検知設定
  warningThreshold?: number;
  criticalThreshold?: number;
  // データ欠損検知
  detectMissingData: boolean;
  // 通知先
  notifySlack: boolean;
  notifyLineWorks: boolean;
};

// デフォルトアラート設定
export const DEFAULT_ALERT_CONFIG: Omit<AlertConfig, 'kpiId'> = {
  enabled: true,
  spikeThresholdPercent: 30, // 30%以上の急上昇
  dropThresholdPercent: 30, // 30%以上の急降下
  detectMissingData: true,
  notifySlack: true,
  notifyLineWorks: true,
};

// 通知メッセージ
export type AlertNotification = {
  id: string;
  anomalies: AnomalyDetectionResult[];
  generatedAt: Date;
  summary: string;
};

// アラート履歴
export type AlertHistory = {
  id: string;
  notification: AlertNotification;
  sentAt: Date;
  channels: ('slack' | 'lineworks')[];
  success: boolean;
  errorMessage?: string;
};
