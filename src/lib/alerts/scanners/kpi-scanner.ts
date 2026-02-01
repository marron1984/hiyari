/**
 * KPI異常スキャナー
 *
 * KPI異常検知結果をアラート形式に変換
 */

import { listKpiDefinitions, getKpiTimeSeries } from '@/lib/kpi/kpi-store';
import { getDefaultAlertConfigs } from '@/lib/kpi/mock-data';
import { detectAllAnomalies } from '@/lib/kpi/anomaly-detector';
import type { CreateAlertRequest, AlertSeverity } from '../types';
import { generateFingerprint } from '../types';

/**
 * KPI異常をスキャンしてアラートリクエストを生成
 */
export function scanKpiAnomalies(): CreateAlertRequest[] {
  const alerts: CreateAlertRequest[] = [];

  // KPI定義を取得
  const definitions = listKpiDefinitions();
  const configs = getDefaultAlertConfigs();

  // 時系列データを収集
  const timeSeriesData = definitions.map((def) => {
    const ts = getKpiTimeSeries(def.id);
    return ts ? { kpiId: def.id, points: ts.points } : null;
  }).filter((ts): ts is { kpiId: string; points: { date: string; value: number | null }[] } => ts !== null);

  // 異常検知
  const anomalies = detectAllAnomalies(timeSeriesData, configs);

  // 日付を取得（フィンガープリント用）
  const today = new Date().toISOString().split('T')[0];

  for (const anomaly of anomalies) {
    const fingerprint = generateFingerprint(
      'kpi_anomaly',
      anomaly.kpiId,
      `${anomaly.anomalyType}:${today}`
    );

    const severity: AlertSeverity = anomaly.severity === 'critical'
      ? 'critical'
      : anomaly.severity === 'warning'
        ? 'warning'
        : 'info';

    alerts.push({
      type: 'kpi_anomaly',
      sourceId: anomaly.kpiId,
      title: `${anomaly.kpiName}に${getAnomalyTitle(anomaly.anomalyType)}を検出`,
      message: anomaly.message,
      severity,
      fingerprint,
      meta: {
        kpiId: anomaly.kpiId,
        kpiName: anomaly.kpiName,
        anomalyType: anomaly.anomalyType,
        currentValue: anomaly.currentValue,
        previousValue: anomaly.previousValue,
        changePercent: anomaly.changePercent,
        threshold: anomaly.threshold,
        dashboardPath: anomaly.dashboardPath,
      },
    });
  }

  return alerts;
}

/**
 * 異常タイプのタイトル
 */
function getAnomalyTitle(anomalyType: string): string {
  const titles: Record<string, string> = {
    spike: '急上昇',
    drop: '急降下',
    threshold_warning: '閾値警告',
    threshold_critical: '閾値超過',
    missing_data: 'データ欠損',
    zero_value: 'ゼロ値',
    trend_change: 'トレンド変化',
  };
  return titles[anomalyType] ?? '異常';
}
