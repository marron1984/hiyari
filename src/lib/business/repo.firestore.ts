/**
 * 事業別サマリー（Business Summary）Firestoreリポジトリ
 *
 * PROD: Cloud Firestore永続化
 *
 * コレクション:
 * - business_units: 事業単位マスタ
 *
 * Task 030: org/business スコープ適用
 */

import { getAdminDb } from '../firebase-admin';
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
import * as complaintsRepo from '@/lib/complaints/repo.firestore';
import * as trainingRepo from '@/lib/training/repo.firestore';
import * as receivablesRepo from '@/lib/receivables/repo';
import * as collectionRepo from '@/lib/collection/repo.firestore';
import * as agreementsRepo from '@/lib/agreements/repo.firestore';

// Task 030: 新ドメイン（スコープ対応済み）
import * as ticketsRepo from '@/lib/tickets/repo';
import * as repairsRepo from '@/lib/repairs/repo';
import * as correctiveActionsRepo from '@/lib/correctiveActions/repo.firestore';
import * as licensesRepo from '@/lib/licenses/repo';

// Task 049: 契約管理
import * as contractsRepo from '@/lib/contracts/repo.firestore';

// スコープ (Task 030)
import type { Scope, DomainCoverage, AppRole } from '@/lib/access/scope';
import {
  createScope,
  isBusinessUnitInScope,
  DOMAIN_SCOPE_COVERAGE,
  getUnscopedDomains,
  canViewFinance,
} from '@/lib/access/scope';

// Task 041: KPI辞書参照
import { getKPIDictionaryEntry } from '@/lib/kpiDictionary/repo';

// ========== 定数 ==========

const COLLECTION = 'business_units';

// ========== ドキュメント変換 ==========

function docToBusinessUnit(doc: FirebaseFirestore.DocumentSnapshot): BusinessUnit {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    name: d.name ?? '',
    type: d.type ?? 'other',
    locationHint: d.locationHint ?? null,
    orgUnitId: d.orgUnitId ?? null,
    isActive: d.isActive ?? true,
    ownerUserId: d.ownerUserId ?? null,
    ownerName: d.ownerName ?? null,
    createdAt: d.createdAt ?? new Date().toISOString(),
    updatedAt: d.updatedAt ?? new Date().toISOString(),
  };
}

// ========== 事業単位 CRUD ==========

export async function listBusinessUnits(activeOnly: boolean = true): Promise<BusinessUnit[]> {
  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (activeOnly) {
      query = query.where('isActive', '==', true);
    }

    const snapshot = await query.get();
    const items = snapshot.docs.map(docToBusinessUnit);
    items.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return items;
  } catch (error) {
    console.error('[Business:Firestore] listBusinessUnits error:', error);
    return [];
  }
}

export async function getBusinessUnitById(id: string): Promise<BusinessUnit | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return docToBusinessUnit(doc);
  } catch (error) {
    console.error('[Business:Firestore] getBusinessUnitById error:', error);
    return null;
  }
}

export async function createBusinessUnit(
  input: CreateBusinessUnitInput,
  actorUserId: string
): Promise<{ success: true; unit: BusinessUnit } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const timestamp = new Date().toISOString();
    const id = `bu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const unit: BusinessUnit = {
      id,
      name: input.name,
      type: input.type,
      locationHint: input.locationHint ?? null,
      orgUnitId: input.orgUnitId ?? null,
      isActive: true,
      ownerUserId: input.ownerUserId ?? null,
      ownerName: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.collection(COLLECTION).doc(id).set(unit);
    return { success: true, unit };
  } catch (error) {
    console.error('[Business:Firestore] createBusinessUnit error:', error);
    return { success: false, error: '事業の作成に失敗しました' };
  }
}

export async function updateBusinessUnit(
  id: string,
  patch: UpdateBusinessUnitInput,
  actorUserId: string
): Promise<{ success: true; unit: BusinessUnit } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '事業が見つかりません' };
    }

    const existing = docToBusinessUnit(doc);
    const updated: BusinessUnit = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(updated);
    return { success: true, unit: updated };
  } catch (error) {
    console.error('[Business:Firestore] updateBusinessUnit error:', error);
    return { success: false, error: '事業の更新に失敗しました' };
  }
}

// ========== サマリー生成 ==========

export async function generateBusinessSummary(
  viewer: ViewerContext,
  businessUnitId: string | null,
  range: SummaryRange = 'thisMonth'
): Promise<BusinessSummary | null> {
  if (!canViewBusinessSummary(viewer.role)) {
    return null;
  }

  const businessUnit = businessUnitId
    ? await getBusinessUnitById(businessUnitId)
    : null;

  const highlights = await collectHighlights(viewer, businessUnitId);
  const commentary = generateCommentary(highlights, businessUnit);

  return {
    businessUnit,
    range,
    generatedAt: new Date().toISOString(),
    highlights,
    commentary,
  };
}

/**
 * 各ドメインからハイライトを集計
 */
async function collectHighlights(
  viewer: ViewerContext,
  businessUnitId: string | null
): Promise<BusinessHighlights> {
  const hasFinanceAccess = canViewFinance(viewer.role);

  // ========== アラート ==========
  const alertStats = alertsRepo.getAlertStats();
  const alertsAll = alertsRepo.listAlerts({ status: 'open' });
  const warningOpen = alertsAll.alerts.filter((a) => a.severity === 'warning').length;

  // ========== クレーム ==========
  const complaintViewer = { userId: viewer.userId, role: viewer.role };
  const complaintStats = await complaintsRepo.getStats(complaintViewer);
  const criticalComplaints = await complaintsRepo.scanCriticalOpen();
  const complaintsResult = await complaintsRepo.listComplaints(complaintViewer, {});
  const highComplaints = complaintsResult
    .complaints.filter(
      (c) =>
        c.severity === 'high' &&
        ['new', 'triaging', 'investigating', 'responding'].includes(c.status)
    );

  // ========== 研修 ==========
  const businessUnitForScope = businessUnitId ? await getBusinessUnitById(businessUnitId) : null;
  const scopeOrgUnitIds = businessUnitForScope?.orgUnitId ? [businessUnitForScope.orgUnitId] : undefined;
  const trainingViewer = { userId: viewer.userId, role: viewer.role };
  const trainingStats = await trainingRepo.getStats(trainingViewer, { orgUnitIds: scopeOrgUnitIds });

  // ========== 未収 ==========
  const receivableViewer = { userId: viewer.userId, role: viewer.role };
  const receivableStats = hasFinanceAccess
    ? receivablesRepo.getStats(receivableViewer, { businessUnitId: businessUnitId ?? undefined })
    : null;

  // ========== 回収フロー ==========
  const collectionViewer = { userId: viewer.userId, role: viewer.role as 'manager' | 'admin' | 'executive' | 'auditor' | 'staff' | 'leader' };
  const collectionStats = hasFinanceAccess
    ? await collectionRepo.getStats(collectionViewer, { businessUnitId: businessUnitId ?? undefined })
    : null;

  // ========== 契約 ==========
  const contractViewer = { userId: viewer.userId, role: viewer.role };
  const contractStats = hasFinanceAccess
    ? await contractsRepo.getStats(contractViewer, { businessUnitId: businessUnitId ?? undefined })
    : null;

  // ========== 同意書 ==========
  const agreementViewer = { userId: viewer.userId, role: viewer.role };
  const agreementStats = await agreementsRepo.getStats(agreementViewer, { orgUnitIds: scopeOrgUnitIds });

  // ========== チケット ==========
  const ticketViewer = { userId: viewer.userId, role: viewer.role };
  const ticketStats = ticketsRepo.getTicketStats(ticketViewer, { businessUnitId });

  // ========== 修繕 ==========
  const repairViewer = { userId: viewer.userId, role: viewer.role };
  const repairStats = repairsRepo.getStats(repairViewer, { businessUnitId });

  // ========== 是正措置 ==========
  const caViewer = { userId: viewer.userId, role: viewer.role };
  const caStats = await correctiveActionsRepo.getStats(caViewer, { businessUnitId });

  // ========== 資格 ==========
  const licenseViewer = { userId: viewer.userId, role: viewer.role };
  const licenseStats = licensesRepo.getStats(licenseViewer, { orgUnitIds: scopeOrgUnitIds });

  const buQuery = businessUnitId ? `?businessUnitId=${businessUnitId}` : '';

  const getKpiMetadata = (kpiId: string) => {
    const entry = getKPIDictionaryEntry(kpiId);
    return {
      direction: entry?.direction ?? null,
      whyItMatters: entry?.whyItMatters ?? null,
    };
  };

  return {
    kpi: {
      keyMetrics: [
        {
          kpiId: 'occupancy_rate',
          name: '稼働率',
          displayValue: '92.5%',
          trend: 'up' as const,
          trendText: '+2.1% 先月比',
          url: '/dashboard/kpi',
          ...getKpiMetadata('occupancy_rate'),
        },
        {
          kpiId: 'staff_turnover',
          name: '離職率',
          displayValue: '12.5%',
          trend: 'down' as const,
          trendText: '-1.2%',
          url: '/dashboard/kpi',
          ...getKpiMetadata('staff_turnover'),
        },
        {
          kpiId: 'hiyari_count',
          name: 'ヒヤリハット報告',
          displayValue: '23件',
          trend: 'up' as const,
          trendText: '+5件',
          url: '/dashboard/kpi',
          ...getKpiMetadata('hiyari_count'),
        },
      ],
    },
    alerts: {
      criticalOpen: alertStats.criticalOpen,
      warningOpen,
      url: '/dashboard/alerts',
    },
    tickets: {
      open: ticketStats.open,
      overdue: ticketStats.overdue,
      urgentOpen: ticketStats.urgentOpen,
      url: `/dashboard/tickets${buQuery}`,
    },
    repairs: {
      highRiskOpen: repairStats.highRiskOpen,
      overdue: repairStats.overdue,
      url: `/dashboard/repairs${buQuery}`,
    },
    complaints: {
      highOpen: highComplaints.length,
      criticalOpen: criticalComplaints.length,
      overdue: complaintStats.overdue,
      url: '/dashboard/complaints',
    },
    correctiveActions: {
      open: caStats.open,
      criticalOpen: caStats.criticalOpen,
      overdue: caStats.overdue,
      url: `/dashboard/corrective-actions${buQuery}`,
    },
    training: {
      overdue: trainingStats?.overdueCount ?? 0,
      assignedOpen: trainingStats?.assignedOpenCount ?? 0,
      sessionsDoneThisWeek: trainingStats?.sessionsDoneThisWeek ?? 0,
      url: scopeOrgUnitIds ? `/dashboard/training?orgUnitId=${scopeOrgUnitIds[0]}` : '/dashboard/training',
    },
    licenses: {
      expired: licenseStats?.expired ?? 0,
      expiring30: licenseStats?.expiring30 ?? 0,
      url: scopeOrgUnitIds ? `/dashboard/licenses?orgUnitId=${scopeOrgUnitIds[0]}` : '/dashboard/licenses',
    },
    receivables: hasFinanceAccess && receivableStats
      ? {
          overdueTotal: receivableStats.overdueTotal,
          aging60Count: receivableStats.aging60Count,
          url: `/dashboard/receivables${businessUnitId ? `?businessUnitId=${businessUnitId}&tab=overdue` : ''}`,
        }
      : null,
    collection: hasFinanceAccess && collectionStats
      ? {
          overdueSteps: collectionStats.overdueSteps,
          url: `/dashboard/collection-flow${businessUnitId ? `?businessUnitId=${businessUnitId}&tab=progress` : ''}`,
        }
      : null,
    contracts: hasFinanceAccess && contractStats
      ? {
          expiring: contractStats.expiring,
          decisionOverdue: contractStats.decisionOverdue,
          highRiskExpiring: contractStats.highRiskExpiring,
          url: `/dashboard/contracts${businessUnitId ? `?businessUnitId=${businessUnitId}&tab=expiring` : ''}`,
        }
      : null,
    agreements: {
      expired: agreementStats?.expiredCount ?? 0,
      expiring30: agreementStats?.expiringCount ?? 0,
      url: '/dashboard/consent',
    },
  };
}

function generateCommentary(
  highlights: BusinessHighlights,
  businessUnit: BusinessUnit | null
): BusinessCommentary {
  const unitName = businessUnit?.name ?? '全体';
  const risks: string[] = [];
  const actions: string[] = [];

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

  if (highlights.receivables && highlights.receivables.overdueTotal > 0) {
    const amount = new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(highlights.receivables.overdueTotal);
    risks.push(`未収金${amount}が期限超過`);
    actions.push('未収管理で回収状況を確認');
  }

  if (highlights.collection && highlights.collection.overdueSteps > 0) {
    risks.push(`回収ステップ${highlights.collection.overdueSteps}件が遅延`);
  }

  if (highlights.contracts) {
    if (highlights.contracts.decisionOverdue > 0) {
      risks.push(`契約${highlights.contracts.decisionOverdue}件が更新判断期限超過`);
      actions.push('契約管理で更新判断を確認');
    }
    if (highlights.contracts.highRiskExpiring > 0) {
      risks.push(`高リスク契約${highlights.contracts.highRiskExpiring}件が期限間近`);
    }
  }

  let summaryText: string;
  if (risks.length === 0) {
    summaryText = `${unitName}の運営状況は良好です。重大なリスクはありません。`;
  } else if (risks.length <= 2) {
    summaryText = `${unitName}に${risks.length}件の注意事項があります。早めの対応を推奨します。`;
  } else {
    summaryText = `${unitName}に${risks.length}件の課題が発生しています。優先順位をつけて対応してください。`;
  }

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

export async function getBusinessSummaryOverviews(
  viewer: ViewerContext
): Promise<BusinessSummaryOverview[]> {
  if (!canViewBusinessSummary(viewer.role)) {
    return [];
  }

  const units = await listBusinessUnits(true);
  const overviews: BusinessSummaryOverview[] = [];

  for (const unit of units) {
    const summary = await generateBusinessSummary(viewer, unit.id);
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
      (h.collection?.overdueSteps ?? 0) +
      (h.receivables?.overdueTotal ? 1 : 0) +
      (h.contracts?.decisionOverdue ?? 0);

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

  overviews.sort((a, b) => {
    const levelOrder = { critical: 0, warning: 1, normal: 2 };
    const levelDiff = levelOrder[a.riskLevel] - levelOrder[b.riskLevel];
    if (levelDiff !== 0) return levelDiff;
    return b.totalIssues - a.totalIssues;
  });

  return overviews;
}

// ========== スコープ対応版 (Task 030) ==========

export async function listBusinessUnitsWithScope(
  scope: Scope,
  activeOnly: boolean = true
): Promise<BusinessUnit[]> {
  let items = await listBusinessUnits(activeOnly);
  items = items.filter((unit) => isBusinessUnitInScope(scope, unit.id));
  return items;
}

export interface ScopedBusinessSummaryOverview extends BusinessSummaryOverview {
  isFiltered: boolean;
}

export interface ScopedOverviewsResponse {
  overviews: ScopedBusinessSummaryOverview[];
  scope: {
    role: AppRole;
    businessUnitIds: string[] | undefined;
    isFullAccess: boolean;
  };
  domainCoverage: DomainCoverage[];
  unscopedDomains: DomainCoverage[];
}

export async function getBusinessSummaryOverviewsWithScope(
  userId: string,
  role: AppRole
): Promise<ScopedOverviewsResponse> {
  const scope = await createScope(userId, role);
  const viewer: ViewerContext = { userId, role };

  if (!canViewBusinessSummary(role)) {
    return {
      overviews: [],
      scope: {
        role,
        businessUnitIds: scope.businessUnitIds,
        isFullAccess: false,
      },
      domainCoverage: DOMAIN_SCOPE_COVERAGE,
      unscopedDomains: getUnscopedDomains(),
    };
  }

  const allUnits = await listBusinessUnits(true);
  const scopedUnits = allUnits.filter((unit) => isBusinessUnitInScope(scope, unit.id));
  const isFullAccess = ['admin', 'executive', 'auditor'].includes(role);

  const overviews: ScopedBusinessSummaryOverview[] = [];

  for (const unit of scopedUnits) {
    const summary = await generateBusinessSummary(viewer, unit.id);
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
      (h.collection?.overdueSteps ?? 0) +
      (h.receivables?.overdueTotal ? 1 : 0) +
      (h.contracts?.decisionOverdue ?? 0);

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
      isFiltered: !isFullAccess,
    });
  }

  overviews.sort((a, b) => {
    const levelOrder = { critical: 0, warning: 1, normal: 2 };
    const levelDiff = levelOrder[a.riskLevel] - levelOrder[b.riskLevel];
    if (levelDiff !== 0) return levelDiff;
    return b.totalIssues - a.totalIssues;
  });

  return {
    overviews,
    scope: {
      role,
      businessUnitIds: scope.businessUnitIds,
      isFullAccess,
    },
    domainCoverage: DOMAIN_SCOPE_COVERAGE,
    unscopedDomains: getUnscopedDomains(),
  };
}

export async function generateBusinessSummaryWithScope(
  scope: Scope,
  businessUnitId: string | null,
  range: SummaryRange = 'thisMonth'
): Promise<BusinessSummary | null> {
  if (!canViewBusinessSummary(scope.role)) {
    return null;
  }

  if (businessUnitId && !isBusinessUnitInScope(scope, businessUnitId)) {
    return null;
  }

  const viewer: ViewerContext = { userId: scope.userId, role: scope.role };
  return generateBusinessSummary(viewer, businessUnitId, range);
}
