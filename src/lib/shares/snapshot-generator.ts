/**
 * 外部共有用スナップショット生成
 *
 * 内部データをサニタイズして外部公開可能な形式に変換
 * PII（個人情報）や内部詳細は絶対に含めない
 */

import {
  OS_FEATURES,
  OS_CATEGORIES,
  getFeatureCountByStatus,
  calculateCompositeScore,
} from '@/config/osFeatures';
import { generateTickets, getTicketCountByPhase } from '@/lib/generateTickets';
import { generateWBRHistory } from '@/lib/wbr-generator';
import { getMockKPITimeSeries, getDefaultAlertConfigs, getKPIMetadata } from '@/lib/kpi/mock-data';
import { detectAllAnomalies } from '@/lib/kpi/anomaly-detector';
import type {
  ExternalSnapshot,
  ExternalExecutiveSummary,
  ExternalKPIHighlights,
  ExternalGovernance,
  ExternalRoadmap,
} from './types';
import { EXTERNAL_KPI_DISPLAY_CONFIG, ALLOWED_EXTERNAL_KPIS } from './types';

/**
 * 外部共有用スナップショットを生成
 */
export function generateExternalSnapshot(): ExternalSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    executiveSummary: generateExternalExecutiveSummary(),
    kpiHighlights: generateExternalKPIHighlights(),
    governance: generateExternalGovernance(),
    roadmap: generateExternalRoadmap(),
  };
}

/**
 * A. Executive Summary（外部向け）
 */
function generateExternalExecutiveSummary(): ExternalExecutiveSummary {
  const counts = getFeatureCountByStatus();
  const total = OS_FEATURES.length;
  const progressPercent = Math.round((counts.active / total) * 100);

  // Top3（スコア順、外部向けに簡潔化）
  const topFeatures = OS_FEATURES.filter(
    (f) => f.status === 'planned' || f.status === 'developing'
  )
    .sort((a, b) => calculateCompositeScore(b) - calculateCompositeScore(a))
    .slice(0, 3);

  const topPriorities = topFeatures.map((f, i) => ({
    rank: i + 1,
    name: f.name,
    reason: getExternalReason(f.category),
  }));

  // リスクサマリー（カテゴリレベル）
  const riskCategories = new Map<string, number>();
  OS_FEATURES.filter((f) => f.status !== 'active' && (f.risk ?? 0) >= 4).forEach((f) => {
    const current = riskCategories.get(f.category) ?? 0;
    riskCategories.set(f.category, current + 1);
  });

  const riskSummary = Array.from(riskCategories.entries())
    .map(([categoryId, count]) => {
      const category = OS_CATEGORIES.find((c) => c.id === categoryId);
      return {
        category: category?.name ?? categoryId,
        level: (count >= 3 ? 'high' : count >= 2 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
        description: getExternalRiskDescription(categoryId, count),
      };
    })
    .slice(0, 3);

  // 総評（外部向け）
  let overview: string;
  if (progressPercent >= 70) {
    overview = `経営管理基盤の整備は順調に進捗しており、現在${progressPercent}%の機能が運用中です。主要な業務プロセスはシステム化が完了し、安定した運用体制を確立しています。`;
  } else if (progressPercent >= 50) {
    overview = `経営管理基盤の構築は中盤フェーズに入り、進捗率${progressPercent}%を達成しています。計画に基づいた段階的な整備を進めており、今後さらなる機能拡充を予定しています。`;
  } else {
    overview = `経営管理基盤の初期整備フェーズを進行中です。現在${progressPercent}%の基盤が稼働しており、優先度に基づいた計画的な構築を継続しています。`;
  }

  return {
    progress: {
      activeCount: counts.active,
      developingCount: counts.developing,
      plannedCount: counts.planned,
      totalCount: total,
      progressPercent,
    },
    topPriorities,
    riskSummary,
    overview,
  };
}

/**
 * B. KPIハイライト（外部向け）
 */
function generateExternalKPIHighlights(): ExternalKPIHighlights {
  const timeSeries = getMockKPITimeSeries();
  const configs = getDefaultAlertConfigs();
  const anomalies = detectAllAnomalies(timeSeries, configs);

  // 公開許可KPIのみ
  const allowedKpis: (typeof ALLOWED_EXTERNAL_KPIS)[number][] = [
    'occupancy_rate',
    'prospect_conversion',
    'inquiry_count',
    'avg_fatigue',
    'turnover_risk_count',
  ];

  const kpis = allowedKpis.map((kpiId) => {
    const series = timeSeries.find((ts) => ts.kpiId === kpiId);
    const metadata = getKPIMetadata(kpiId);
    const config = EXTERNAL_KPI_DISPLAY_CONFIG.find((c) => c.kpiId === kpiId);

    if (!series || !metadata) {
      return {
        name: kpiId,
        currentValue: 'N/A',
        trend: 'stable' as const,
        status: 'normal' as const,
      };
    }

    const latestPoint = series.points[series.points.length - 1];
    const prevPoint = series.points[series.points.length - 2];
    const currentValue = latestPoint?.value ?? 0;
    const prevValue = prevPoint?.value ?? 0;

    // トレンド判定
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (prevValue && currentValue) {
      const change = ((currentValue - prevValue) / prevValue) * 100;
      if (change > 5) trend = 'up';
      else if (change < -5) trend = 'down';
    }

    // ステータス判定
    let status: 'normal' | 'warning' | 'critical' = 'normal';
    const hasAnomaly = anomalies.some((a) => a.kpiId === kpiId);
    if (hasAnomaly) {
      const anomaly = anomalies.find((a) => a.kpiId === kpiId);
      if (anomaly?.severity === 'critical') status = 'critical';
      else if (anomaly?.severity === 'warning') status = 'warning';
    }

    // 表示値（レンジ or 実数）
    let displayValue: string;
    if (config?.showExactValue === false && config.rangeLabels) {
      // レンジ表示
      if (currentValue <= 2) displayValue = config.rangeLabels.low;
      else if (currentValue <= 3.5) displayValue = config.rangeLabels.medium;
      else displayValue = config.rangeLabels.high;
    } else {
      displayValue = `${currentValue}${metadata.unit}`;
    }

    return {
      name: config?.displayName ?? metadata.name,
      currentValue: displayValue,
      trend,
      status,
    };
  });

  // 異常検知統計
  const resolvedCount = Math.floor(anomalies.length * 0.7); // 仮：70%解決済み
  const openCount = anomalies.length - resolvedCount;

  const now = new Date();
  const period = `${now.getFullYear()}年${now.getMonth() + 1}月`;

  return {
    kpis,
    anomalyStats: {
      totalDetected: anomalies.length,
      resolvedCount,
      openCount,
    },
    period,
  };
}

/**
 * C. ガバナンス＆運用証跡
 */
function generateExternalGovernance(): ExternalGovernance {
  // WBR履歴
  const wbrHistory = generateWBRHistory(4);
  const wbrRecords = wbrHistory.map((wbr) => ({
    weekLabel: wbr.weekLabel,
    status: 'completed' as const,
    summary: `経営レビュー実施済み。${wbr.executiveSummary.goodPoints.length}件の好調点、${wbr.executiveSummary.issues.length}件の課題を確認。`,
  }));

  // アラート統計（仮データ）
  const alertStats = {
    open: 2,
    acknowledged: 3,
    resolved: 15,
  };

  return {
    wbrRecords,
    alertStats,
    lastReviewedAt: new Date().toISOString(),
  };
}

/**
 * D. ロードマップ（外部向け）
 */
function generateExternalRoadmap(): ExternalRoadmap {
  const tickets = generateTickets();
  const phaseCounts = getTicketCountByPhase();

  const thisMonth = tickets
    .filter((t) => t.phase === 'thisMonth')
    .slice(0, 5)
    .map((t) => ({
      name: sanitizeFeatureName(t.title),
      status: 'planned' as const,
    }));

  const nextMonth = tickets
    .filter((t) => t.phase === 'nextMonth')
    .slice(0, 5)
    .map((t) => ({
      name: sanitizeFeatureName(t.title),
      status: 'planned' as const,
    }));

  const thisQuarter = tickets
    .filter((t) => t.phase === 'thisQuarter')
    .slice(0, 5)
    .map((t) => ({
      name: sanitizeFeatureName(t.title),
      status: 'planned' as const,
    }));

  return { thisMonth, nextMonth, thisQuarter };
}

// ヘルパー関数

function getExternalReason(category: string): string {
  const reasons: Record<string, string> = {
    core: '経営基盤の強化',
    document: '文書管理の効率化',
    people: '人材管理の最適化',
    communication: '情報共有の円滑化',
    approval: 'ガバナンス強化',
    operation: '業務効率の向上',
    education: '人材育成の体制整備',
    risk: 'リスク管理の高度化',
    family: 'サービス品質の向上',
    finance: '財務管理の強化',
  };
  return reasons[category] ?? '業務改善';
}

function getExternalRiskDescription(category: string, count: number): string {
  const descriptions: Record<string, string> = {
    risk: '安全管理体制の継続的な改善を推進中',
    people: '人材管理プロセスの整備を進行中',
    document: '文書管理の電子化を推進中',
    finance: '財務管理体制の強化を計画中',
    communication: '情報共有基盤の整備を進行中',
    approval: '承認フローの標準化を推進中',
  };
  return descriptions[category] ?? '改善施策を計画・実行中';
}

function sanitizeFeatureName(title: string): string {
  // 【】を除去し、機能名のみを返す
  return title.replace(/【(.+?)】/, '$1').replace('機能実装', '').trim();
}
