// ======== AA-HUB ダッシュボード KPIデータ取得 ========

import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { getCheckinHistory, getChaosDashboardMetrics, getInterventions } from '@/lib/chaos';
import { getSalesDeals, getSalesAccounts } from '@/lib/sales';
import { getProspects, applyProspectTimeScope } from '@/lib/prospect';
import { getFacilitiesWithVacancy } from '@/lib/vacancy';
import { getRingisByUser, getPendingRingis } from '@/lib/ringi';
import { calculateBatchMoveInProbability, calculateExpectedMoveIns } from '@/lib/scoring';
import { safeRate, calcOccupancyRate, calcInterventionRate, formatPercent } from '@/lib/dashboard/calc';
import { getMeterColor, METER_LABELS, type MeterColor } from '@/types/chaos';
import {
  type DashboardRole,
  type KPIValue,
  type AIVPSummary,
  type AIVPAction,
  KPI_DEFINITIONS,
  ROLE_KPI_CONFIG,
  getKPIStatus,
  getKPIMeaning,
} from '@/types/dashboard-kpi';
import type { User } from '@/types';

// ======== KPIフェッチャー ========

export interface KPIFetchResult {
  kpis: KPIValue[];
  aiSummary: AIVPSummary | null;
  errors: string[];
}

/**
 * 役割に応じたKPIデータを取得
 */
export async function fetchKPIData(
  user: User,
  role: DashboardRole
): Promise<KPIFetchResult> {
  const kpiIds = ROLE_KPI_CONFIG[role];
  const errors: string[] = [];
  const kpis: KPIValue[] = [];

  // 必要なデータを並列取得
  const [
    checkinData,
    chaosData,
    interventionData,
    ringiData,
    salesData,
    occupancyData,
  ] = await Promise.all([
    fetchCheckinData(user).catch(e => { errors.push('checkin'); return null; }),
    fetchChaosData().catch(e => { errors.push('chaos'); return null; }),
    fetchInterventionData().catch(e => { errors.push('intervention'); return null; }),
    fetchRingiData(user, role).catch(e => { errors.push('ringi'); return null; }),
    role === 'exec' ? fetchSalesData().catch(e => { errors.push('sales'); return null; }) : null,
    role === 'exec' ? fetchOccupancyData().catch(e => { errors.push('occupancy'); return null; }) : null,
  ]);

  // 各KPIの値を計算
  for (const kpiId of kpiIds) {
    const definition = KPI_DEFINITIONS[kpiId];
    if (!definition) continue;

    const kpiValue = calculateKPIValue(
      kpiId,
      { checkinData, chaosData, interventionData, ringiData, salesData, occupancyData },
      user,
      role
    );

    kpis.push(kpiValue);
  }

  // AI副社長サマリーを生成
  const aiSummary = generateAISummary(kpis, role, { chaosData, interventionData, ringiData });

  return { kpis, aiSummary, errors };
}

// ======== データ取得関数 ========

interface CheckinData {
  todayCheckin: any;
  todayScore: number | null;
  todayMeterColor: MeterColor | null;
  checkinCount: number;
}

async function fetchCheckinData(user: User): Promise<CheckinData> {
  const history = await getCheckinHistory(user.id, 7);
  const todayCheckin = history[0];

  let todayScore: number | null = null;
  let todayMeterColor: MeterColor | null = null;

  if (todayCheckin) {
    todayScore = Math.round(
      ((todayCheckin.physicalFatigue + todayCheckin.mentalFatigue + todayCheckin.anxiety +
        todayCheckin.decisionLoad + (4 - todayCheckin.sleep) + (4 - todayCheckin.consulted)) / 6) * 25
    );
    todayMeterColor = getMeterColor(todayScore);
  }

  return {
    todayCheckin,
    todayScore,
    todayMeterColor,
    checkinCount: history.length,
  };
}

interface ChaosData {
  avgFatigue: number;
  avgMentalLoad: number;
  alertCount: { yellow: number; red: number };
  burnoutRiskHeatmap: { userId: string; userName: string; score: number; level: string }[];
  teamData: { userId: string; userName: string; score: number; level: MeterColor }[];
}

async function fetchChaosData(): Promise<ChaosData> {
  const chaosData = await getChaosDashboardMetrics(DEFAULT_TENANT_ID);

  const teamData = chaosData.organization.burnoutRiskHeatmap.map(m => ({
    userId: m.userId,
    userName: m.userName,
    score: m.score,
    level: getMeterColor(m.score),
  }));

  return {
    ...chaosData.organization,
    teamData,
  };
}

interface InterventionData {
  total: number;
  done: number;
  open: number;
  rate: number | null;
}

async function fetchInterventionData(): Promise<InterventionData> {
  const interventions = await getInterventions('open', 100);
  const done = interventions.filter(i => i.status === 'done').length;
  const open = interventions.filter(i => i.status === 'open').length;

  return {
    total: interventions.length,
    done,
    open,
    rate: calcInterventionRate(done, interventions.length),
  };
}

interface RingiData {
  draft: number;
  submitted: number;
  returned: number;
  pendingApproval: number;
}

async function fetchRingiData(user: User, role: DashboardRole): Promise<RingiData> {
  const myRingis = await getRingisByUser(user.id, user.tenantId);
  const draft = myRingis.filter(r => r.status === 'draft').length;
  const submitted = myRingis.filter(r => r.status === 'submitted').length;
  const returned = myRingis.filter(r => r.status === 'returned').length;

  let pendingApproval = 0;
  if (role !== 'staff') {
    try {
      const pending = await getPendingRingis(user.tenantId, user.branchId);
      pendingApproval = pending.length;
    } catch (e) {
      console.error('[KPI:ringi] pendingRingis failed', e);
    }
  }

  return { draft, submitted, returned, pendingApproval };
}

interface SalesData {
  accounts: number;
  activeDeals: number;
  completedDeals: number;
  totalDeals: number;
  cvRate: number | null;
  expectedMoveIns: number;
}

async function fetchSalesData(): Promise<SalesData> {
  const [dealsData, accountsData, prospectsData] = await Promise.all([
    getSalesDeals(DEFAULT_TENANT_ID),
    getSalesAccounts(DEFAULT_TENANT_ID),
    getProspects(DEFAULT_TENANT_ID),
  ]);

  const activeDeals = dealsData.filter(d => !['請求書到着', '失注'].includes(d.status));
  const completedDeals = dealsData.filter(d => d.status === '請求書到着');
  const cvRate = safeRate(completedDeals.length, dealsData.length);

  // 入居見込み計算
  const kpiTargetProspects = applyProspectTimeScope(prospectsData);
  const activeProspects = kpiTargetProspects.filter(
    p => p.status !== '見送り' && p.status !== 'クローズ' && p.status !== '入居決定'
  );
  const scoringResults = calculateBatchMoveInProbability(activeProspects);
  const expectedMoveIns = calculateExpectedMoveIns(scoringResults);

  return {
    accounts: accountsData.length,
    activeDeals: activeDeals.length,
    completedDeals: completedDeals.length,
    totalDeals: dealsData.length,
    cvRate,
    expectedMoveIns,
  };
}

interface OccupancyData {
  rate: number | null;
  totalCapacity: number;
  totalVacant: number;
}

async function fetchOccupancyData(): Promise<OccupancyData> {
  const facilitiesData = await getFacilitiesWithVacancy(DEFAULT_TENANT_ID);
  const totalCapacity = facilitiesData.reduce((sum, f) => sum + (f.facility.capacity || 0), 0);
  const totalVacant = facilitiesData.reduce((sum, f) => sum + (f.vacancy?.vacantCount ?? 0), 0);
  const rate = calcOccupancyRate(totalCapacity, totalVacant);

  return { rate, totalCapacity, totalVacant };
}

// ======== KPI値計算 ========

interface AllData {
  checkinData: CheckinData | null;
  chaosData: ChaosData | null;
  interventionData: InterventionData | null;
  ringiData: RingiData | null;
  salesData: SalesData | null;
  occupancyData: OccupancyData | null;
}

function calculateKPIValue(
  kpiId: string,
  data: AllData,
  user: User,
  role: DashboardRole
): KPIValue {
  const definition = KPI_DEFINITIONS[kpiId];
  let value: number | null = null;
  let meaning = 'データなし';
  let status: 'normal' | 'warning' | 'critical' = 'normal';

  switch (kpiId) {
    // スタッフ向け
    case 'my_checkin':
      if (data.checkinData?.todayScore !== null) {
        value = data.checkinData?.todayScore ?? null;
        status = getKPIStatus(value, definition);
        meaning = data.checkinData?.todayMeterColor
          ? METER_LABELS[data.checkinData.todayMeterColor]
          : 'チェックインしてください';
      } else {
        meaning = 'チェックインしてください';
      }
      break;

    case 'my_tasks':
      value = 0; // TODO: タスク数を実装
      status = getKPIStatus(value, definition);
      meaning = getKPIMeaning(kpiId, value, status);
      break;

    case 'my_approvals':
      if (data.ringiData) {
        value = data.ringiData.returned + data.ringiData.submitted;
        status = data.ringiData.returned > 0 ? 'warning' : 'normal';
        meaning = data.ringiData.returned > 0
          ? `${data.ringiData.returned}件の差戻しあり`
          : value > 0 ? `${data.ringiData.submitted}件申請中` : '申請なし';
      }
      break;

    case 'my_overtime':
      value = 0; // TODO: 残業時間を実装
      status = getKPIStatus(value, definition);
      meaning = getKPIMeaning(kpiId, value, status);
      break;

    case 'team_support':
      value = null;
      meaning = '相談はこちらから';
      break;

    case 'announcements':
      value = 0;
      meaning = '新着なし';
      break;

    // マネージャー向け
    case 'team_condition':
      if (data.chaosData) {
        const redCount = data.chaosData.teamData.filter(m => m.level === 'red').length;
        const yellowCount = data.chaosData.teamData.filter(m => m.level === 'yellow').length;
        value = redCount + yellowCount;
        status = redCount > 0 ? 'critical' : yellowCount > 0 ? 'warning' : 'normal';
        meaning = redCount > 0
          ? `${redCount}人が要サポート`
          : yellowCount > 0 ? `${yellowCount}人が余裕少なめ` : 'チームは順調';
      }
      break;

    case 'pending_approvals':
      if (data.ringiData) {
        value = data.ringiData.pendingApproval;
        status = getKPIStatus(value, definition);
        meaning = getKPIMeaning(kpiId, value, status);
      }
      break;

    case 'team_overtime':
      value = 0; // TODO: チーム残業を実装
      status = getKPIStatus(value, definition);
      meaning = getKPIMeaning(kpiId, value, status);
      break;

    case 'support_queue':
      if (data.interventionData) {
        value = data.interventionData.open;
        status = getKPIStatus(value, definition);
        meaning = getKPIMeaning(kpiId, value, status);
      }
      break;

    case 'intervention_rate':
      if (data.interventionData) {
        value = data.interventionData.rate;
        status = getKPIStatus(value, definition);
        meaning = getKPIMeaning(kpiId, value, status);
      }
      break;

    case 'wbr_tasks':
      value = 0; // TODO: WBRタスクを実装
      status = getKPIStatus(value, definition);
      meaning = getKPIMeaning(kpiId, value, status);
      break;

    // 経営向け
    case 'occupancy_rate':
      if (data.occupancyData) {
        value = data.occupancyData.rate;
        status = getKPIStatus(value, definition);
        meaning = getKPIMeaning(kpiId, value, status);
      }
      break;

    case 'expected_moveins':
      if (data.salesData) {
        value = data.salesData.expectedMoveIns;
        meaning = `今月${value}件の見込み`;
      }
      break;

    case 'org_condition':
      if (data.chaosData) {
        const redCount = data.chaosData.teamData.filter(m => m.level === 'red').length;
        const yellowCount = data.chaosData.teamData.filter(m => m.level === 'yellow').length;
        value = redCount + yellowCount;
        status = redCount > 0 ? 'critical' : yellowCount > 0 ? 'warning' : 'normal';
        meaning = `赤${redCount}/黄${yellowCount}`;
      }
      break;

    case 'human_risk':
      value = 0; // TODO: 人材リスクスコアを実装
      status = getKPIStatus(value, definition);
      meaning = getKPIMeaning(kpiId, value, status);
      break;

    case 'cashflow':
      value = null; // TODO: キャッシュフローを実装
      meaning = '準備中';
      break;

    default:
      meaning = '未実装';
  }

  return {
    id: kpiId,
    value,
    meaning,
    status,
  };
}

// ======== AI副社長サマリー生成 ========

function generateAISummary(
  kpis: KPIValue[],
  role: DashboardRole,
  data: {
    chaosData: ChaosData | null;
    interventionData: InterventionData | null;
    ringiData: RingiData | null;
  }
): AIVPSummary {
  const alertKpis = kpis.filter(k => k.status === 'critical' || k.status === 'warning');
  const criticalKpis = kpis.filter(k => k.status === 'critical');

  // ヘッドライン生成
  let headline: string;
  if (criticalKpis.length > 0) {
    const kpiLabels = criticalKpis.map(k => KPI_DEFINITIONS[k.id]?.label).filter(Boolean);
    headline = `${kpiLabels.slice(0, 2).join('と')}に対応が必要です`;
  } else if (alertKpis.length > 0) {
    headline = `${alertKpis.length}件の注意項目があります`;
  } else {
    headline = '現在、特に問題はありません';
  }

  // 優先アクション生成
  const priorityActions: AIVPAction[] = [];

  // 差戻し稟議
  if (data.ringiData && data.ringiData.returned > 0) {
    priorityActions.push({
      id: 'ringi_returned',
      title: `差戻し稟議 ${data.ringiData.returned}件`,
      description: '再提出が必要な稟議があります',
      href: '/dashboard/approvals',
      priority: 'high',
      isAlert: true,
    });
  }

  // 承認待ち
  if (data.ringiData && data.ringiData.pendingApproval > 0 && role !== 'staff') {
    priorityActions.push({
      id: 'pending_approval',
      title: `承認待ち ${data.ringiData.pendingApproval}件`,
      description: '承認依頼が届いています',
      href: '/admin/ringi',
      priority: data.ringiData.pendingApproval >= 5 ? 'high' : 'medium',
      isAlert: data.ringiData.pendingApproval >= 5,
    });
  }

  // サポートが必要なメンバー
  if (data.chaosData && role !== 'staff') {
    const redCount = data.chaosData.teamData.filter(m => m.level === 'red').length;
    if (redCount > 0) {
      priorityActions.push({
        id: 'team_support',
        title: `要サポート ${redCount}人`,
        description: 'フォローが必要なメンバーがいます',
        href: '/dashboard/os/team',
        priority: 'high',
        isAlert: true,
      });
    }
  }

  // 未対応の介入
  if (data.interventionData && data.interventionData.open > 0 && role !== 'staff') {
    priorityActions.push({
      id: 'intervention_open',
      title: `サポート待ち ${data.interventionData.open}件`,
      description: '対応が必要なサポートがあります',
      href: '/dashboard/os/team',
      priority: data.interventionData.open >= 3 ? 'high' : 'medium',
    });
  }

  return {
    headline,
    priorityActions: priorityActions.slice(0, 3),
    alertCount: alertKpis.length,
    updatedAt: new Date(),
  };
}
