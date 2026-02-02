/**
 * 事業別サマリー（Business Summary）リポジトリ
 *
 * 事業単位マスタと集計サマリー生成
 * 現状は in-memory ストレージ（将来 DB 置換）
 */

import type {
  BusinessUnit,
  BusinessUnitType,
  BusinessSummary,
  BusinessHighlights,
  BusinessCommentary,
  SummaryRange,
  ViewerContext,
  CreateBusinessUnitInput,
  UpdateBusinessUnitInput,
} from './types';
import { canViewBusinessSummary, canManageBusinessUnits } from './types';

// 他のリポジトリからの集計用インポート
import * as alertsRepo from '@/lib/alerts/repo';
import * as complaintsRepo from '@/lib/complaints/repo';
import * as trainingRepo from '@/lib/training/repo';
import * as receivablesRepo from '@/lib/receivables/repo';
import * as collectionRepo from '@/lib/collection/repo';
import * as agreementsRepo from '@/lib/agreements/repo';

// ========== ストレージ ==========

const businessUnitsStore = new Map<string, BusinessUnit>();

// ========== ユーティリティ ==========

function generateId(): string {
  return `bu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== 事業単位 CRUD ==========

export function listBusinessUnits(activeOnly: boolean = true): BusinessUnit[] {
  let items = Array.from(businessUnitsStore.values());
  if (activeOnly) {
    items = items.filter((u) => u.isActive);
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return items;
}

export function getBusinessUnitById(id: string): BusinessUnit | null {
  return businessUnitsStore.get(id) ?? null;
}

export function createBusinessUnit(
  input: CreateBusinessUnitInput,
  actorUserId: string
): { success: true; unit: BusinessUnit } | { success: false; error: string } {
  const timestamp = now();
  const unit: BusinessUnit = {
    id: generateId(),
    name: input.name,
    type: input.type,
    locationHint: input.locationHint ?? null,
    isActive: true,
    ownerUserId: input.ownerUserId ?? null,
    ownerName: null, // 後でUserから取得
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  businessUnitsStore.set(unit.id, unit);
  return { success: true, unit };
}

export function updateBusinessUnit(
  id: string,
  patch: UpdateBusinessUnitInput,
  actorUserId: string
): { success: true; unit: BusinessUnit } | { success: false; error: string } {
  const existing = businessUnitsStore.get(id);
  if (!existing) {
    return { success: false, error: '事業が見つかりません' };
  }

  const updated: BusinessUnit = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };

  businessUnitsStore.set(id, updated);
  return { success: true, unit: updated };
}

// ========== サマリー生成 ==========

/**
 * 事業別サマリーを生成
 * businessUnitId が null の場合は全体集計
 */
export function generateBusinessSummary(
  viewer: ViewerContext,
  businessUnitId: string | null,
  range: SummaryRange = 'thisMonth'
): BusinessSummary | null {
  if (!canViewBusinessSummary(viewer.role)) {
    return null;
  }

  const businessUnit = businessUnitId
    ? getBusinessUnitById(businessUnitId)
    : null;

  // 各ドメインからハイライトを集計
  const highlights = collectHighlights(viewer, businessUnitId);

  // コメンタリー生成（ルールベース）
  const commentary = generateCommentary(highlights, businessUnit);

  return {
    businessUnit,
    range,
    generatedAt: now(),
    highlights,
    commentary,
  };
}

/**
 * 各ドメインからハイライトを集計
 */
function collectHighlights(
  viewer: ViewerContext,
  businessUnitId: string | null
): BusinessHighlights {
  // ========== アラート ==========
  const alertStats = alertsRepo.getAlertStats();
  const alertsAll = alertsRepo.listAlerts({ status: 'open' });
  const warningOpen = alertsAll.alerts.filter((a) => a.severity === 'warning').length;

  // ========== クレーム ==========
  const complaintViewer = { userId: viewer.userId, role: viewer.role };
  const complaintStats = complaintsRepo.getStats(complaintViewer);
  const criticalComplaints = complaintsRepo.scanCriticalOpen();
  const highComplaints = complaintsRepo
    .listComplaints(complaintViewer, {})
    .complaints.filter(
      (c) =>
        c.severity === 'high' &&
        ['new', 'triaging', 'investigating', 'responding'].includes(c.status)
    );

  // ========== 研修 ==========
  const overdueTraining = trainingRepo.overdueAssignmentsScan();

  // ========== 未収 ==========
  const receivableViewer = { userId: viewer.userId, role: viewer.role };
  const receivableStats = receivablesRepo.getStats(receivableViewer);

  // ========== 回収フロー ==========
  const collectionViewer = { userId: viewer.userId, role: viewer.role as 'manager' | 'admin' | 'executive' | 'auditor' | 'staff' | 'leader' };
  const collectionStats = collectionRepo.getStats(collectionViewer);

  // ========== 同意書 ==========
  const agreementViewer = { userId: viewer.userId, role: viewer.role };
  const agreementStats = agreementsRepo.getStats(agreementViewer);

  return {
    kpi: {
      keyMetrics: [
        // 主要KPIサンプル（実際はKPIリポジトリから）
        {
          kpiId: 'occupancy_rate',
          name: '稼働率',
          displayValue: '92.5%',
          trend: 'up',
          trendText: '+2.1% 先月比',
          url: '/dashboard/kpi',
        },
        {
          kpiId: 'staff_retention',
          name: '職員定着率',
          displayValue: '87.3%',
          trend: 'flat',
          trendText: '±0.2%',
          url: '/dashboard/kpi',
        },
        {
          kpiId: 'customer_satisfaction',
          name: '顧客満足度',
          displayValue: '4.2/5.0',
          trend: 'up',
          trendText: '+0.3',
          url: '/dashboard/kpi',
        },
      ],
    },
    alerts: {
      criticalOpen: alertStats.criticalOpen,
      warningOpen,
      url: '/dashboard/alerts',
    },
    tickets: {
      open: 5,         // 仮データ（ticketsリポジトリから取得）
      overdue: 1,
      urgentOpen: 2,
      url: '/dashboard/tickets',
    },
    repairs: {
      highRiskOpen: 0, // 未実装
      overdue: 0,
      url: '/dashboard/repair-tickets',
    },
    complaints: {
      highOpen: highComplaints.length,
      criticalOpen: criticalComplaints.length,
      overdue: complaintStats.overdue,
      url: '/dashboard/complaints',
    },
    correctiveActions: {
      open: 0,         // 未実装
      criticalOpen: 0,
      overdue: 0,
      url: '/dashboard/corrective-actions',
    },
    training: {
      overdue: overdueTraining.length,
      url: '/dashboard/training',
    },
    licenses: {
      expired: 0,      // 未実装
      expiring30: 0,
      url: '/dashboard/certifications',
    },
    receivables: {
      overdueTotal: receivableStats?.overdueTotal ?? 0,
      aging60Count: 0, // 計算が必要
      url: '/dashboard/receivables',
    },
    collection: {
      overdueSteps: collectionStats?.overdueSteps ?? 0,
      url: '/dashboard/collection-flow',
    },
    agreements: {
      expired: agreementStats?.expiredCount ?? 0,
      expiring30: agreementStats?.expiringCount ?? 0,
      url: '/dashboard/consent',
    },
  };
}

/**
 * コメンタリー生成（ルールベース）
 */
function generateCommentary(
  highlights: BusinessHighlights,
  businessUnit: BusinessUnit | null
): BusinessCommentary {
  const unitName = businessUnit?.name ?? '全体';
  const risks: string[] = [];
  const actions: string[] = [];

  // リスク判定
  if (highlights.alerts.criticalOpen > 0) {
    risks.push(`重大アラート${highlights.alerts.criticalOpen}件が未対応`);
    actions.push('アラートセンターで重大アラートを確認');
  }

  if (highlights.complaints.criticalOpen > 0) {
    risks.push(`重大クレーム${highlights.complaints.criticalOpen}件が対応中`);
    actions.push('クレーム対応画面で進捗を確認');
  }

  if (highlights.complaints.overdue > 0) {
    risks.push(`クレーム${highlights.complaints.overdue}件が期限超過`);
  }

  if (highlights.training.overdue > 0) {
    risks.push(`研修${highlights.training.overdue}件が未受講`);
    actions.push('研修管理で未受講者を確認');
  }

  if (highlights.agreements.expired > 0) {
    risks.push(`同意書${highlights.agreements.expired}件が期限切れ`);
    actions.push('同意書管理で更新対応');
  }

  if (highlights.receivables.overdueTotal > 0) {
    const amount = new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(highlights.receivables.overdueTotal);
    risks.push(`未収金${amount}が期限超過`);
    actions.push('未収管理で回収状況を確認');
  }

  if (highlights.collection.overdueSteps > 0) {
    risks.push(`回収ステップ${highlights.collection.overdueSteps}件が遅延`);
  }

  // サマリーテキスト生成
  let summaryText: string;
  if (risks.length === 0) {
    summaryText = `${unitName}の運営状況は良好です。重大なリスクはありません。`;
  } else if (risks.length <= 2) {
    summaryText = `${unitName}に${risks.length}件の注意事項があります。早めの対応を推奨します。`;
  } else {
    summaryText = `${unitName}に${risks.length}件の課題が発生しています。優先順位をつけて対応してください。`;
  }

  // アクションがない場合のデフォルト
  if (actions.length === 0) {
    actions.push('定期的な状況モニタリングを継続');
  }

  return {
    summaryText,
    topRisks: risks.slice(0, 5),
    nextActions: actions.slice(0, 3),
  };
}

// ========== 全事業サマリー一覧 ==========

export interface BusinessSummaryOverview {
  unit: BusinessUnit;
  riskLevel: 'critical' | 'warning' | 'normal';
  totalIssues: number;
  criticalIssues: number;
}

export function getBusinessSummaryOverviews(
  viewer: ViewerContext
): BusinessSummaryOverview[] {
  if (!canViewBusinessSummary(viewer.role)) {
    return [];
  }

  const units = listBusinessUnits(true);
  const overviews: BusinessSummaryOverview[] = [];

  for (const unit of units) {
    const summary = generateBusinessSummary(viewer, unit.id);
    if (!summary) continue;

    const h = summary.highlights;
    const criticalIssues =
      h.alerts.criticalOpen +
      h.complaints.criticalOpen +
      h.correctiveActions.criticalOpen;

    const warningIssues =
      h.alerts.warningOpen +
      h.complaints.highOpen +
      h.complaints.overdue +
      h.training.overdue +
      h.agreements.expired +
      h.collection.overdueSteps;

    const totalIssues = criticalIssues + warningIssues;

    let riskLevel: 'critical' | 'warning' | 'normal' = 'normal';
    if (criticalIssues > 0) {
      riskLevel = 'critical';
    } else if (warningIssues > 0) {
      riskLevel = 'warning';
    }

    overviews.push({
      unit,
      riskLevel,
      totalIssues,
      criticalIssues,
    });
  }

  // リスクレベル順でソート
  overviews.sort((a, b) => {
    const levelOrder = { critical: 0, warning: 1, normal: 2 };
    const levelDiff = levelOrder[a.riskLevel] - levelOrder[b.riskLevel];
    if (levelDiff !== 0) return levelDiff;
    return b.totalIssues - a.totalIssues;
  });

  return overviews;
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (businessUnitsStore.size > 0) return;

  const units: BusinessUnit[] = [
    {
      id: 'bu_001',
      name: '西淀川 ええかいご',
      type: 'homecare',
      locationHint: '大阪市西淀川区',
      isActive: true,
      ownerUserId: 'user_manager',
      ownerName: '田中管理者',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'bu_002',
      name: '東淀川 訪問介護',
      type: 'homecare',
      locationHint: '大阪市東淀川区',
      isActive: true,
      ownerUserId: 'user_leader',
      ownerName: '山田リーダー',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'bu_003',
      name: 'サ高住 さくら',
      type: 'housing',
      locationHint: '大阪市淀川区',
      isActive: true,
      ownerUserId: 'user_manager',
      ownerName: '田中管理者',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'bu_004',
      name: '老人ホーム 71床',
      type: 'facility',
      locationHint: '大阪市北区',
      isActive: true,
      ownerUserId: 'user_executive',
      ownerName: '佐藤部長',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'bu_005',
      name: '訪問看護ステーション',
      type: 'nursing',
      locationHint: '大阪市中央区',
      isActive: true,
      ownerUserId: null,
      ownerName: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'bu_corp',
      name: '法人本部',
      type: 'corp',
      locationHint: null,
      isActive: true,
      ownerUserId: 'user_executive',
      ownerName: '佐藤部長',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ];

  units.forEach((u) => businessUnitsStore.set(u.id, u));
}

// 初期化
initDemoData();
