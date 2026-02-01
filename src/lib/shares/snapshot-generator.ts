/**
 * 外部共有用スナップショット生成
 *
 * 内部データをサニタイズして外部公開可能な形式に変換
 * PII（個人情報）や内部詳細は絶対に含めない
 * テンプレートに応じて表示内容・粒度を制御
 */

import {
  OS_FEATURES,
  OS_CATEGORIES,
  getFeatureCountByStatus,
  calculateCompositeScore,
} from '@/config/osFeatures';
import {
  type ExternalTemplateId,
  type ExternalShareTemplate,
  getExternalShareTemplate,
  formatKpiValueByTemplate,
  getToneBasedPhrase,
} from '@/config/externalShareTemplates';
import { generateTickets } from '@/lib/generateTickets';
import { generateWBRHistory } from '@/lib/wbr-generator';
import { getMockKPITimeSeries, getDefaultAlertConfigs, getKPIMetadata } from '@/lib/kpi/mock-data';
import { detectAllAnomalies } from '@/lib/kpi/anomaly-detector';
import type {
  ExternalSnapshot,
  ExternalExecutiveSummary,
  ExternalKPIHighlights,
  ExternalGovernance,
  ExternalRoadmap,
  ExternalWBRProof,
  ExternalAlertsSummary,
} from './types';
import { EXTERNAL_KPI_DISPLAY_CONFIG } from './types';

/**
 * 外部共有用スナップショットを生成
 */
export function generateExternalSnapshot(
  templateId: ExternalTemplateId = 'bank',
  notes?: string
): ExternalSnapshot {
  const template = getExternalShareTemplate(templateId);

  return {
    generatedAt: new Date().toISOString(),
    templateId,
    executiveSummary: generateExternalExecutiveSummary(template),
    kpiHighlights: generateExternalKPIHighlights(template),
    governance: generateExternalGovernance(template),
    roadmap: generateExternalRoadmap(template),
    wbrProof: template.sections.includes('wbrProof')
      ? generateExternalWBRProof(template)
      : undefined,
    alertsSummary: template.sections.includes('alertsSummary')
      ? generateExternalAlertsSummary(template)
      : undefined,
    notes,
  };
}

/**
 * A. Executive Summary（外部向け）
 */
function generateExternalExecutiveSummary(
  template: ExternalShareTemplate
): ExternalExecutiveSummary {
  const counts = getFeatureCountByStatus();
  const total = OS_FEATURES.length;
  const progressPercent = Math.round((counts.active / total) * 100);

  // Top3（スコア順、外部向けに簡潔化）
  const maxItems = template.sectionConfig.topPriorities?.maxItems ?? 3;
  const topFeatures = OS_FEATURES.filter(
    (f) => f.status === 'planned' || f.status === 'developing'
  )
    .sort((a, b) => calculateCompositeScore(b) - calculateCompositeScore(a))
    .slice(0, maxItems);

  const topPriorities = topFeatures.map((f, i) => ({
    rank: i + 1,
    name: f.name,
    reason: getExternalReason(f.category, template.tone),
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
        description: getExternalRiskDescription(categoryId, template.tone),
      };
    })
    .slice(0, 3);

  // 総評（テンプレートのトーンに応じて）
  const overview = generateOverview(progressPercent, template.tone);

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
function generateExternalKPIHighlights(
  template: ExternalShareTemplate
): ExternalKPIHighlights {
  const timeSeries = getMockKPITimeSeries();
  const configs = getDefaultAlertConfigs();
  const anomalies = detectAllAnomalies(timeSeries, configs);

  // テンプレートのallowlistに基づいてフィルタリング
  const maxItems = template.sectionConfig.kpiHighlights?.maxItems ?? 5;
  const allowedKpis = template.kpiAllowlist.slice(0, maxItems);

  const kpis = allowedKpis.map((kpiId) => {
    const series = timeSeries.find((ts) => ts.kpiId === kpiId);
    const metadata = getKPIMetadata(kpiId);
    const displayConfig = EXTERNAL_KPI_DISPLAY_CONFIG.find((c) => c.kpiId === kpiId);

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

    // 表示値（テンプレートの表示モードに応じて）
    const isHigherBetter = !['avg_fatigue', 'turnover_risk_count'].includes(kpiId);
    const displayValue = formatKpiValueByTemplate(
      currentValue,
      metadata.unit,
      template.kpiDisplayMode,
      isHigherBetter
    );

    return {
      name: displayConfig?.displayName ?? metadata.name,
      currentValue: displayValue,
      trend,
      status,
    };
  });

  // 異常検知統計
  const resolvedCount = Math.floor(anomalies.length * 0.7);
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
function generateExternalGovernance(
  template: ExternalShareTemplate
): ExternalGovernance {
  const maxItems = template.sectionConfig.governance?.maxItems ?? 4;

  // WBR履歴
  const wbrHistory = generateWBRHistory(maxItems);
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
function generateExternalRoadmap(
  template: ExternalShareTemplate
): ExternalRoadmap {
  const tickets = generateTickets();
  const maxItems = template.sectionConfig.roadmap?.maxItems ?? 5;

  const thisMonth = tickets
    .filter((t) => t.phase === 'thisMonth')
    .slice(0, maxItems)
    .map((t) => ({
      name: sanitizeFeatureName(t.title),
      status: 'planned' as const,
    }));

  const nextMonth = tickets
    .filter((t) => t.phase === 'nextMonth')
    .slice(0, maxItems)
    .map((t) => ({
      name: sanitizeFeatureName(t.title),
      status: 'planned' as const,
    }));

  const thisQuarter = tickets
    .filter((t) => t.phase === 'thisQuarter')
    .slice(0, maxItems)
    .map((t) => ({
      name: sanitizeFeatureName(t.title),
      status: 'planned' as const,
    }));

  return { thisMonth, nextMonth, thisQuarter };
}

/**
 * E. WBR証跡（監査向け詳細）
 */
function generateExternalWBRProof(
  template: ExternalShareTemplate
): ExternalWBRProof {
  const maxItems = template.sectionConfig.wbrProof?.maxItems ?? 8;
  const wbrHistory = generateWBRHistory(maxItems);

  const records = wbrHistory.map((wbr) => ({
    weekLabel: wbr.weekLabel,
    executedAt: new Date().toISOString(), // 仮
    attendeeCount: Math.floor(Math.random() * 5) + 3, // 仮：3-7名
    decisionsCount: wbr.nextActions.top3.length,
    issuesCount: wbr.executiveSummary.issues.length,
  }));

  return {
    records,
    totalExecuted: records.length,
    executionRate: 100, // 100%実施
  };
}

/**
 * F. アラートサマリー
 */
function generateExternalAlertsSummary(
  template: ExternalShareTemplate
): ExternalAlertsSummary {
  const timeSeries = getMockKPITimeSeries();
  const configs = getDefaultAlertConfigs();
  const anomalies = detectAllAnomalies(timeSeries, configs);

  const now = new Date();
  const period = `${now.getFullYear()}年${now.getMonth() + 1}月`;

  // カテゴリ別集計
  const categoryMap = new Map<string, number>();
  anomalies.forEach((a) => {
    const current = categoryMap.get(a.anomalyType) ?? 0;
    categoryMap.set(a.anomalyType, current + 1);
  });

  const categories = Array.from(categoryMap.entries())
    .map(([category, count]) => ({
      category: getAnomalyTypeName(category),
      count,
    }))
    .slice(0, 5);

  const resolved = Math.floor(anomalies.length * 0.7);

  return {
    period,
    totalRaised: anomalies.length,
    resolved,
    pending: anomalies.length - resolved,
    avgResolutionDays: 2.3, // 仮
    categories,
  };
}

// ヘルパー関数

function getExternalReason(
  category: string,
  tone: 'conservative' | 'balanced' | 'assertive'
): string {
  const reasons: Record<string, Record<string, string>> = {
    core: {
      conservative: '経営基盤の安定化',
      balanced: '経営基盤の強化',
      assertive: '競争力の源泉となる経営基盤の構築',
    },
    document: {
      conservative: '文書管理の適正化',
      balanced: '文書管理の効率化',
      assertive: 'ペーパーレス化による生産性向上',
    },
    people: {
      conservative: '人材管理の整備',
      balanced: '人材管理の最適化',
      assertive: '人的資本経営の実現',
    },
    communication: {
      conservative: '情報共有体制の整備',
      balanced: '情報共有の円滑化',
      assertive: '組織の意思決定スピード向上',
    },
    approval: {
      conservative: '内部統制の強化',
      balanced: 'ガバナンス強化',
      assertive: '経営の透明性向上',
    },
    operation: {
      conservative: '業務の標準化',
      balanced: '業務効率の向上',
      assertive: 'オペレーショナルエクセレンスの追求',
    },
    education: {
      conservative: '研修体制の整備',
      balanced: '人材育成の体制整備',
      assertive: '次世代リーダー育成',
    },
    risk: {
      conservative: 'リスク管理体制の整備',
      balanced: 'リスク管理の高度化',
      assertive: 'リスクの先読み体制構築',
    },
    family: {
      conservative: 'サービス提供の安定化',
      balanced: 'サービス品質の向上',
      assertive: '顧客満足度の最大化',
    },
    finance: {
      conservative: '財務管理の適正化',
      balanced: '財務管理の強化',
      assertive: '財務体質の強化',
    },
  };

  return reasons[category]?.[tone] ?? '業務改善';
}

function getExternalRiskDescription(
  category: string,
  tone: 'conservative' | 'balanced' | 'assertive'
): string {
  const descriptions: Record<string, Record<string, string>> = {
    risk: {
      conservative: '安全管理体制の継続的な改善に取り組んでおります',
      balanced: '安全管理体制の改善を推進中',
      assertive: '業界最高水準の安全管理体制を構築中',
    },
    people: {
      conservative: '人材管理プロセスの整備を進めております',
      balanced: '人材管理プロセスの整備を進行中',
      assertive: '人材マネジメントの革新を推進中',
    },
    document: {
      conservative: '文書管理の電子化を計画的に進めております',
      balanced: '文書管理の電子化を推進中',
      assertive: '完全ペーパーレス化を加速中',
    },
    finance: {
      conservative: '財務管理体制の強化を計画しております',
      balanced: '財務管理体制の強化を計画中',
      assertive: '財務基盤の抜本的強化を推進中',
    },
    communication: {
      conservative: '情報共有基盤の整備を進めております',
      balanced: '情報共有基盤の整備を進行中',
      assertive: 'リアルタイム情報共有基盤を構築中',
    },
    approval: {
      conservative: '承認フローの標準化を進めております',
      balanced: '承認フローの標準化を推進中',
      assertive: '承認プロセスの完全自動化を推進中',
    },
  };

  return descriptions[category]?.[tone] ?? getToneBasedPhrase(tone, 'risk');
}

function generateOverview(
  progressPercent: number,
  tone: 'conservative' | 'balanced' | 'assertive'
): string {
  if (tone === 'conservative') {
    if (progressPercent >= 70) {
      return `経営管理基盤の整備は${getToneBasedPhrase(tone, 'progress')}。現在${progressPercent}%の機能が運用中であり、安定した運用体制を維持しております。`;
    } else if (progressPercent >= 50) {
      return `経営管理基盤の構築は中盤フェーズに入り、進捗率${progressPercent}%を達成しております。${getToneBasedPhrase(tone, 'plan')}`;
    } else {
      return `経営管理基盤の初期整備フェーズを進行中です。現在${progressPercent}%の基盤が稼働しており、${getToneBasedPhrase(tone, 'plan')}`;
    }
  } else if (tone === 'assertive') {
    if (progressPercent >= 70) {
      return `経営管理基盤は${progressPercent}%の高い完成度に到達。主要プロセスのシステム化を完了し、${getToneBasedPhrase(tone, 'progress')}`;
    } else if (progressPercent >= 50) {
      return `経営管理基盤の構築は進捗率${progressPercent}%を達成。計画を上回るペースで${getToneBasedPhrase(tone, 'plan')}`;
    } else {
      return `経営管理基盤の構築を${getToneBasedPhrase(tone, 'plan')}。現在${progressPercent}%の基盤が稼働し、着実に拡充中です。`;
    }
  } else {
    // balanced
    if (progressPercent >= 70) {
      return `経営管理基盤の整備は${getToneBasedPhrase(tone, 'progress')}。現在${progressPercent}%の機能が運用中です。`;
    } else if (progressPercent >= 50) {
      return `経営管理基盤の構築は中盤フェーズに入り、進捗率${progressPercent}%を達成しています。${getToneBasedPhrase(tone, 'plan')}`;
    } else {
      return `経営管理基盤の初期整備フェーズを進行中です。現在${progressPercent}%の基盤が稼働しており、${getToneBasedPhrase(tone, 'plan')}`;
    }
  }
}

function sanitizeFeatureName(title: string): string {
  return title.replace(/【(.+?)】/, '$1').replace('機能実装', '').trim();
}

function getAnomalyTypeName(anomalyType: string): string {
  const names: Record<string, string> = {
    spike: '急上昇',
    drop: '急降下',
    threshold_warning: '閾値警告',
    threshold_critical: '閾値超過',
    missing_data: 'データ欠損',
    zero_value: 'ゼロ値',
    trend_change: 'トレンド変化',
  };
  return names[anomalyType] ?? anomalyType;
}
