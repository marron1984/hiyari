/**
 * KPI 異常検知ロジック
 *
 * ルールベースの異常検知（AI不使用）
 * - 急変（spike/drop）
 * - 閾値超え（warning/critical）
 * - データ欠損（missing_data）
 * - ゼロ値（zero_value）
 */

import type {
  KPITimeSeries,
  KPIMetadata,
  AlertConfig,
  AnomalyDetectionResult,
  AnomalyType,
} from './types';
import { getKPIMetadata } from './mock-data';

/**
 * 単一KPIの異常を検知
 */
export function detectAnomalies(
  timeSeries: KPITimeSeries,
  config: AlertConfig
): AnomalyDetectionResult[] {
  if (!config.enabled) return [];

  const results: AnomalyDetectionResult[] = [];
  const metadata = getKPIMetadata(timeSeries.kpiId);
  if (!metadata) return [];

  const { points } = timeSeries;
  if (points.length < 2) return [];

  const latestPoint = points[points.length - 1];
  const previousPoint = points[points.length - 2];

  // 1. データ欠損チェック
  if (config.detectMissingData && latestPoint.value === null) {
    results.push(createResult(metadata, 'missing_data', 'warning', null, previousPoint.value, null));
  }

  // 以降は最新値がnullでない場合のみ
  if (latestPoint.value === null) return results;

  const currentValue = latestPoint.value;
  const prevValue = previousPoint.value;

  // 2. ゼロ値チェック（通常ゼロでないKPIの場合）
  if (currentValue === 0 && prevValue !== null && prevValue > 0) {
    const isExpectedZero = metadata.direction === 'lower_is_better' && metadata.thresholds?.critical === 0;
    if (!isExpectedZero) {
      results.push(
        createResult(metadata, 'zero_value', 'warning', currentValue, prevValue, -100)
      );
    }
  }

  // 3. 変動検知（前日比）
  if (prevValue !== null && prevValue !== 0) {
    const changePercent = ((currentValue - prevValue) / prevValue) * 100;

    // 急上昇（spike）
    if (changePercent >= config.spikeThresholdPercent) {
      const severity = metadata.direction === 'higher_is_better' ? 'info' : 'warning';
      results.push(
        createResult(metadata, 'spike', severity, currentValue, prevValue, changePercent)
      );
    }

    // 急降下（drop）
    if (changePercent <= -config.dropThresholdPercent) {
      const severity = metadata.direction === 'lower_is_better' ? 'info' : 'warning';
      results.push(
        createResult(metadata, 'drop', severity, currentValue, prevValue, changePercent)
      );
    }
  }

  // 4. 閾値チェック
  // Critical閾値
  if (config.criticalThreshold !== undefined) {
    const isCritical =
      metadata.direction === 'higher_is_better'
        ? currentValue < config.criticalThreshold
        : currentValue > config.criticalThreshold;

    if (isCritical) {
      results.push(
        createResult(
          metadata,
          'threshold_critical',
          'critical',
          currentValue,
          prevValue,
          prevValue ? ((currentValue - prevValue) / prevValue) * 100 : null,
          config.criticalThreshold
        )
      );
      return results; // Criticalの場合はWarningは出さない
    }
  }

  // Warning閾値
  if (config.warningThreshold !== undefined) {
    const isWarning =
      metadata.direction === 'higher_is_better'
        ? currentValue < config.warningThreshold
        : currentValue > config.warningThreshold;

    if (isWarning) {
      results.push(
        createResult(
          metadata,
          'threshold_warning',
          'warning',
          currentValue,
          prevValue,
          prevValue ? ((currentValue - prevValue) / prevValue) * 100 : null,
          config.warningThreshold
        )
      );
    }
  }

  return results;
}

/**
 * 複数KPIの異常を一括検知
 */
export function detectAllAnomalies(
  timeSeriesArray: KPITimeSeries[],
  configs: AlertConfig[]
): AnomalyDetectionResult[] {
  const results: AnomalyDetectionResult[] = [];

  for (const timeSeries of timeSeriesArray) {
    const config = configs.find((c) => c.kpiId === timeSeries.kpiId);
    if (config) {
      results.push(...detectAnomalies(timeSeries, config));
    }
  }

  // 重要度順にソート
  return results.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * 検知結果を生成
 */
function createResult(
  metadata: KPIMetadata,
  anomalyType: AnomalyType,
  severity: 'info' | 'warning' | 'critical',
  currentValue: number | null,
  previousValue: number | null,
  changePercent: number | null,
  threshold?: number
): AnomalyDetectionResult {
  return {
    kpiId: metadata.id,
    kpiName: metadata.name,
    anomalyType,
    severity,
    currentValue,
    previousValue,
    changePercent: changePercent !== null ? Math.round(changePercent * 10) / 10 : null,
    threshold,
    message: generateMessage(metadata, anomalyType, currentValue, previousValue, changePercent, threshold),
    detectedAt: new Date(),
    dashboardPath: metadata.dashboardPath,
  };
}

/**
 * 異常メッセージを生成
 */
function generateMessage(
  metadata: KPIMetadata,
  anomalyType: AnomalyType,
  currentValue: number | null,
  previousValue: number | null,
  changePercent: number | null,
  threshold?: number
): string {
  const { name, unit, direction } = metadata;
  const changeText =
    changePercent !== null
      ? `（前日比 ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%）`
      : '';

  switch (anomalyType) {
    case 'spike':
      if (direction === 'higher_is_better') {
        return `${name}が急上昇：${currentValue}${unit}${changeText}。好調の兆候。`;
      }
      return `${name}が急上昇：${currentValue}${unit}${changeText}。要確認。`;

    case 'drop':
      if (direction === 'lower_is_better') {
        return `${name}が急減少：${currentValue}${unit}${changeText}。改善の兆候。`;
      }
      return `${name}が急降下：${currentValue}${unit}${changeText}。対応が必要。`;

    case 'threshold_critical':
      return `${name}が危険水準：${currentValue}${unit}（閾値: ${threshold}${unit}）。即座の対応が必要。`;

    case 'threshold_warning':
      return `${name}が警告水準：${currentValue}${unit}（閾値: ${threshold}${unit}）。監視を強化。`;

    case 'missing_data':
      return `${name}のデータが欠損しています。データ収集を確認してください。`;

    case 'zero_value':
      return `${name}がゼロになりました${changeText}。システムエラーまたは異常な状態の可能性。`;

    case 'trend_change':
      return `${name}のトレンドに変化：${currentValue}${unit}。継続監視が必要。`;

    default:
      return `${name}に異常を検知：${currentValue}${unit}`;
  }
}

/**
 * 異常タイプの表示名
 */
export function getAnomalyTypeLabel(type: AnomalyType): string {
  const labels: Record<AnomalyType, string> = {
    spike: '急上昇',
    drop: '急降下',
    threshold_critical: '危険閾値超過',
    threshold_warning: '警告閾値超過',
    missing_data: 'データ欠損',
    zero_value: 'ゼロ値検出',
    trend_change: 'トレンド変化',
  };
  return labels[type];
}

/**
 * 重要度の表示名
 */
export function getSeverityLabel(severity: 'info' | 'warning' | 'critical'): string {
  const labels = {
    info: '情報',
    warning: '警告',
    critical: '重大',
  };
  return labels[severity];
}

/**
 * 重要度の色設定
 */
export function getSeverityColor(severity: 'info' | 'warning' | 'critical'): {
  text: string;
  bg: string;
  border: string;
  emoji: string;
} {
  const colors = {
    info: {
      text: 'text-blue-700',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      emoji: 'ℹ️',
    },
    warning: {
      text: 'text-amber-700',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      emoji: '⚠️',
    },
    critical: {
      text: 'text-red-700',
      bg: 'bg-red-50',
      border: 'border-red-200',
      emoji: '🔴',
    },
  };
  return colors[severity];
}
