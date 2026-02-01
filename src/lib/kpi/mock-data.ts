/**
 * KPI モックデータ
 *
 * デモ用のKPI時系列データとメタデータ
 */

import type { KPITimeSeries, KPIMetadata, AlertConfig, DEFAULT_ALERT_CONFIG } from './types';

// KPIメタデータ一覧
export const KPI_METADATA: KPIMetadata[] = [
  {
    id: 'occupancy_rate',
    name: '入居率',
    description: '全居室に対する入居済み居室の割合',
    unit: '%',
    category: 'sales',
    direction: 'higher_is_better',
    frequency: 'daily',
    isExternalAllowed: true,
    thresholds: { warning: 85, critical: 80 },
    dashboardPath: '/dashboard/vacancy',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'prospect_conversion',
    name: '見学→入居CV率',
    description: '見学から入居決定に至った割合',
    unit: '%',
    category: 'sales',
    direction: 'higher_is_better',
    frequency: 'weekly',
    isExternalAllowed: true,
    thresholds: { warning: 15, critical: 10 },
    dashboardPath: '/dashboard/prospects',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'inquiry_count',
    name: '問い合わせ件数',
    description: '週間の新規問い合わせ数',
    unit: '件',
    category: 'sales',
    direction: 'higher_is_better',
    frequency: 'weekly',
    isExternalAllowed: true,
    thresholds: { warning: 10, critical: 5 },
    dashboardPath: '/dashboard/prospects',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'incident_count',
    name: '事故・インシデント件数',
    description: '週間の事故・インシデント報告数',
    unit: '件',
    category: 'risk',
    direction: 'lower_is_better',
    frequency: 'weekly',
    isExternalAllowed: true,
    thresholds: { warning: 5, critical: 10 },
    dashboardPath: '/admin/incidents',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'hiyari_count',
    name: 'ヒヤリハット件数',
    description: '週間のヒヤリハット報告数',
    unit: '件',
    category: 'risk',
    direction: 'higher_is_better', // 報告が多いほど良い（気づきの文化）
    frequency: 'weekly',
    isExternalAllowed: false, // 内部向け指標
    thresholds: { warning: 5, critical: 3 },
    dashboardPath: '/admin/incidents',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'pending_approvals',
    name: '未承認申請数',
    description: '承認待ちの申請件数',
    unit: '件',
    category: 'operation',
    direction: 'lower_is_better',
    frequency: 'daily',
    isExternalAllowed: false, // 内部向け指標
    thresholds: { warning: 10, critical: 20 },
    dashboardPath: '/dashboard/approvals',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'avg_fatigue',
    name: '平均疲労度',
    description: 'チーム全体の平均疲労スコア（1-5）',
    unit: 'pt',
    category: 'people',
    direction: 'lower_is_better',
    frequency: 'weekly',
    isExternalAllowed: false, // 内部向け指標
    thresholds: { warning: 3.5, critical: 4.0 },
    dashboardPath: '/dashboard/os/team',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'turnover_risk_count',
    name: '離職リスク人数',
    description: '離職リスクが高いと判定されたスタッフ数',
    unit: '人',
    category: 'people',
    direction: 'lower_is_better',
    frequency: 'weekly',
    isExternalAllowed: false, // 内部向け指標
    thresholds: { warning: 3, critical: 5 },
    dashboardPath: '/dashboard/ai-vp/human-risk',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'uncollected_amount',
    name: '未収金額',
    description: '回収未済の金額合計',
    unit: '万円',
    category: 'finance',
    direction: 'lower_is_better',
    frequency: 'weekly',
    isExternalAllowed: true,
    thresholds: { warning: 100, critical: 200 },
    dashboardPath: '/dashboard/receivables',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'overdue_contracts',
    name: '期限切れ契約',
    description: '更新期限を過ぎた契約数',
    unit: '件',
    category: 'operation',
    direction: 'lower_is_better',
    frequency: 'weekly',
    isExternalAllowed: false, // 内部向け指標
    thresholds: { warning: 3, critical: 5 },
    dashboardPath: '/dashboard/contracts',
    createdAt: '2024-01-01T00:00:00Z',
  },
];

// 過去30日分の日付を生成
function generateDates(days: number = 30): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// ランダムな変動を持つ時系列データを生成
function generateTimeSeries(
  kpiId: string,
  baseValue: number,
  volatility: number,
  trend: number = 0,
  anomalyDay?: number,
  anomalyMultiplier?: number
): KPITimeSeries {
  const dates = generateDates(30);
  const points = dates.map((date, i) => {
    let value = baseValue + trend * i + (Math.random() - 0.5) * volatility * 2;

    // 異常値を挿入
    if (anomalyDay !== undefined && i === anomalyDay && anomalyMultiplier !== undefined) {
      value *= anomalyMultiplier;
    }

    // 負の値を防止
    value = Math.max(0, value);

    return {
      date,
      value: Math.round(value * 10) / 10,
    };
  });

  return { kpiId, points };
}

// モック時系列データを生成
export function getMockKPITimeSeries(): KPITimeSeries[] {
  return [
    // 入居率: 安定（90%前後）
    generateTimeSeries('occupancy_rate', 90, 3, 0),
    // 見学CV率: やや上昇トレンド
    generateTimeSeries('prospect_conversion', 18, 5, 0.1),
    // 問い合わせ件数: 今週急落（異常検知対象）
    generateTimeSeries('inquiry_count', 25, 5, 0, 28, 0.3), // 28日目に70%減少
    // 事故件数: 低め安定
    generateTimeSeries('incident_count', 2, 1, 0),
    // ヒヤリハット: 今週急増（良い傾向）
    generateTimeSeries('hiyari_count', 8, 2, 0, 29, 2.5), // 最新日に2.5倍
    // 未承認申請: 今週急増（異常検知対象）
    generateTimeSeries('pending_approvals', 5, 3, 0, 29, 4), // 最新日に4倍
    // 平均疲労度: 上昇トレンド（警告）
    generateTimeSeries('avg_fatigue', 3.2, 0.3, 0.02),
    // 離職リスク人数: 安定
    generateTimeSeries('turnover_risk_count', 2, 1, 0),
    // 未収金額: やや増加
    generateTimeSeries('uncollected_amount', 80, 20, 1),
    // 期限切れ契約: 欠損データあり
    {
      kpiId: 'overdue_contracts',
      points: generateDates(30).map((date, i) => ({
        date,
        value: i === 29 ? null : Math.round(2 + Math.random() * 2), // 最新日が欠損
      })),
    },
  ];
}

// KPIメタデータを取得
export function getKPIMetadata(kpiId: string): KPIMetadata | undefined {
  return KPI_METADATA.find((m) => m.id === kpiId);
}

// 全KPIメタデータを取得
export function getAllKPIMetadata(): KPIMetadata[] {
  return KPI_METADATA;
}

// デフォルトアラート設定を取得
export function getDefaultAlertConfigs(): AlertConfig[] {
  return KPI_METADATA.map((meta) => ({
    kpiId: meta.id,
    enabled: true,
    spikeThresholdPercent: 30,
    dropThresholdPercent: 30,
    warningThreshold: meta.thresholds?.warning,
    criticalThreshold: meta.thresholds?.critical,
    detectMissingData: true,
    notifySlack: true,
    notifyLineWorks: true,
  }));
}
