/**
 * 役職別ホーム ウィジェットビルダー
 *
 * Task 053: 各ウィジェットのデータを取得
 */

import type { AppRole } from '@/config/appRoles';
import type {
  Widget,
  WidgetType,
  AlertsWidget,
  UnclassifiedWidget,
  TicketsWidget,
  RepairsWidget,
  CorrectiveActionsWidget,
  LicensesWidget,
  TrainingWidget,
  HandoverWidget,
  AnnouncementsWidget,
  DailyOpsWidget,
  WeeklyOpsWidget,
  BusinessSummaryWidget,
  ReceivablesWidget,
  AIVPTop3Widget,
  ContractsWidget,
  OsMapWidget,
  QualityRiskWidget,
  MbrWidget,
  VacancyInquiryKpisWidget,
  SalesTasksWidget,
} from './types';
import { WIDGET_LABELS } from './types';
import type { ViewerContext } from '@/lib/business/types';
import type { AlertSeverity } from '@/lib/alerts/types';

// リポジトリインポート
import { getAlertStats, listAlerts } from '@/lib/alerts/repo';
import { getUnclassifiedCounts } from '@/lib/scope/detectUnclassifiedBusinessUnit';
import { getTicketStats, listTickets, listTicketEvents } from '@/lib/tickets/repo';
import { buildAssigneeKpis } from '@/lib/vacancies/buildAssigneeKpis';
import { getStats as getRepairsStats } from '@/lib/repairs/repo';
import { getStats as getCorrectiveActionsStats } from '@/lib/correctiveActions/repo';
import { scanExpiring, scanExpired } from '@/lib/licenses/repo';
import { getRunStats as getDailyOpsStats, listRecentRuns as listDailyOpsRuns, getRecentFailedSteps as getDailyFailedSteps } from '@/lib/dailyOps/repo';
import { getRunStats as getWeeklyOpsStats, listRecentRuns as listWeeklyOpsRuns, getRecentFailedSteps as getWeeklyFailedSteps, hasFailedRecently as hasWeeklyFailedRecently } from '@/lib/weeklyOps/repo';
import { getStats as getReceivablesStats } from '@/lib/receivables/repo';
import { countUnreadHandoverItems } from '@/lib/handover/repo';
import { listAnnouncementsForUser } from '@/lib/announcements/store';
import { listReadIds } from '@/lib/readTracking/repo';
import { listMbrs } from '@/lib/mbr/mbrRepo';
import { getMbrOverdueSummary } from '@/lib/dailyOps/scanMbrActionsOverdue';
import { getStats as getTrainingStats, overdueAssignmentsScan } from '@/lib/training/repo';
import { scanExpiringContracts, scanDecisionOverdueContracts } from '@/lib/contracts/repo';
import { OS_FEATURES } from '@/config/osFeatures';
import { getBusinessSummaryOverviews, listBusinessUnits } from '@/lib/business/repo';

/**
 * ビューアーコンテキストを生成
 */
function createViewerContext(userId: string, role: AppRole): ViewerContext {
  return { userId, role };
}

/**
 * アラートウィジェットを構築
 */
export function buildAlertsWidget(): AlertsWidget {
  const stats = getAlertStats();
  const { alerts } = listAlerts({ status: 'open', limit: 5 });

  // 最も高い重要度を取得
  let severity: AlertSeverity = 'info';
  if (stats.criticalOpen > 0) severity = 'critical';
  else if (stats.open > 0) severity = 'warning';

  return {
    type: 'alerts',
    title: WIDGET_LABELS.alerts,
    href: '/dashboard/alerts',
    count: stats.open,
    severity,
    criticalOpen: stats.criticalOpen,
    warningOpen: stats.open - stats.criticalOpen,
    totalOpen: stats.open,
    isEmpty: stats.open === 0,
  };
}

/**
 * 未分類ウィジェットを構築
 */
export function buildUnclassifiedWidget(): UnclassifiedWidget {
  const counts = getUnclassifiedCounts();

  let severity: AlertSeverity = 'info';
  if (counts.total >= 20) severity = 'critical';
  else if (counts.total >= 5) severity = 'warning';

  return {
    type: 'unclassified',
    title: WIDGET_LABELS.unclassified,
    href: '/dashboard/admin/unclassified',
    count: counts.total,
    severity,
    tickets: counts.tickets,
    repairs: counts.repairs,
    correctiveActions: counts.correctiveActions,
    total: counts.total,
    isEmpty: counts.total === 0,
  };
}

/**
 * チケットウィジェットを構築
 */
export function buildTicketsWidget(userId: string, role: AppRole): TicketsWidget {
  const viewer = createViewerContext(userId, role);
  const stats = getTicketStats(viewer);

  let severity: AlertSeverity = 'info';
  if (stats.overdue > 0 || stats.urgentOpen > 0) severity = 'warning';
  if (stats.overdue >= 5) severity = 'critical';

  return {
    type: 'tickets',
    title: WIDGET_LABELS.tickets,
    href: '/dashboard/tickets',
    count: stats.open,
    severity,
    myAssignedOpen: stats.myAssignedOpen,
    myRequestedOpen: stats.myRequestedOpen,
    overdue: stats.overdue,
    urgentOpen: stats.urgentOpen,
    isEmpty: stats.open === 0,
  };
}

/**
 * 修繕ウィジェットを構築
 */
export function buildRepairsWidget(userId: string, role: AppRole): RepairsWidget {
  const viewer = createViewerContext(userId, role);
  const stats = getRepairsStats(viewer);

  let severity: AlertSeverity = 'info';
  if (stats.highRiskOpen > 0) severity = 'critical';
  else if (stats.overdue > 0) severity = 'warning';

  return {
    type: 'repairs',
    title: WIDGET_LABELS.repairs,
    href: '/dashboard/repairs',
    count: stats.open,
    severity,
    open: stats.open,
    highRiskOpen: stats.highRiskOpen,
    overdue: stats.overdue,
    isEmpty: stats.open === 0,
  };
}

/**
 * 是正措置ウィジェットを構築
 */
export function buildCorrectiveActionsWidget(userId: string, role: AppRole): CorrectiveActionsWidget {
  const viewer = createViewerContext(userId, role);
  const stats = getCorrectiveActionsStats(viewer);

  let severity: AlertSeverity = 'info';
  if (stats.criticalOpen > 0) severity = 'critical';
  else if (stats.overdue > 0) severity = 'warning';

  return {
    type: 'corrective_actions',
    title: WIDGET_LABELS.corrective_actions,
    href: '/dashboard/corrective-actions',
    count: stats.open,
    severity,
    open: stats.open,
    criticalOpen: stats.criticalOpen,
    overdue: stats.overdue,
    isEmpty: stats.open === 0,
  };
}

/**
 * 資格ウィジェットを構築
 */
export function buildLicensesWidget(userId: string, role: AppRole): LicensesWidget {
  const viewer = createViewerContext(userId, role);
  const expired = scanExpired();
  const expiring = scanExpiring(30);

  // 自分の期限切れ間近をフィルタ
  const myExpiring = expiring.filter(l => l.user.id === userId);

  let severity: AlertSeverity = 'info';
  if (expired.length > 0) severity = 'critical';
  else if (expiring.length > 0) severity = 'warning';

  return {
    type: 'licenses',
    title: WIDGET_LABELS.licenses,
    href: '/dashboard/licenses',
    count: expired.length + expiring.length,
    severity,
    expired: expired.length,
    expiringSoon: expiring.length,
    myExpiringSoon: myExpiring.length,
    isEmpty: expired.length === 0 && expiring.length === 0,
  };
}

/**
 * 研修ウィジェットを構築
 */
export function buildTrainingWidget(userId: string, role: AppRole): TrainingWidget {
  const viewer = createViewerContext(userId, role);
  const stats = getTrainingStats(viewer);

  if (!stats) {
    return {
      type: 'training',
      title: WIDGET_LABELS.training,
      href: '/dashboard/training',
      count: 0,
      severity: 'info',
      notCompleted: 0,
      myNotCompleted: 0,
      isEmpty: true,
    };
  }

  const overdue = overdueAssignmentsScan();
  const myOverdue = overdue.filter(a => a.userId === userId);

  let severity: AlertSeverity = 'info';
  if (overdue.length >= 5) severity = 'critical';
  else if (overdue.length > 0 || stats.assignedOpenCount > 0) severity = 'warning';

  return {
    type: 'training',
    title: WIDGET_LABELS.training,
    href: '/dashboard/training',
    count: stats.assignedOpenCount,
    severity,
    notCompleted: stats.assignedOpenCount,
    myNotCompleted: myOverdue.length,
    isEmpty: stats.assignedOpenCount === 0 && overdue.length === 0,
  };
}

/**
 * 申し送りウィジェットを構築
 */
export function buildHandoverWidget(userId: string, role: AppRole): HandoverWidget {
  const unreadCount = countUnreadHandoverItems(role, userId);

  return {
    type: 'handover',
    title: WIDGET_LABELS.handover,
    href: '/dashboard/handover',
    count: unreadCount,
    severity: unreadCount > 3 ? 'warning' : 'info',
    unread: unreadCount,
    urgent: 0, // TODO: urgentフィルタ
    isEmpty: unreadCount === 0,
  };
}

/**
 * 周知ウィジェットを構築
 */
export function buildAnnouncementsWidget(userId: string, role: AppRole): AnnouncementsWidget {
  // ユーザー対象の周知を取得
  const { announcements } = listAnnouncementsForUser(role, userId);
  const announcementIds = announcements.map(a => a.id);

  // 既読リストを取得
  const readIds = listReadIds(userId, 'announcement', announcementIds);
  const unreadCount = announcements.filter(a => !readIds.has(a.id)).length;

  return {
    type: 'announcements',
    title: WIDGET_LABELS.announcements,
    href: '/dashboard/announcements',
    count: unreadCount,
    severity: unreadCount > 5 ? 'warning' : 'info',
    unread: unreadCount,
    isEmpty: unreadCount === 0,
  };
}

/**
 * 日次オペウィジェットを構築（Ticket 067: 失敗ステップ名表示）
 */
export function buildDailyOpsWidget(): DailyOpsWidget {
  const stats = getDailyOpsStats();
  const recentRuns = listDailyOpsRuns(5);
  const failedSteps = getDailyFailedSteps();

  // Ticket 130: MBR改善タスク期限超過件数
  const mbrOverdue = getMbrOverdueSummary();

  const hasFailedRecently = stats.lastFailedRun !== null &&
    (!stats.lastSuccessfulRun ||
      new Date(stats.lastFailedRun.startedAt) > new Date(stats.lastSuccessfulRun.startedAt));

  return {
    type: 'daily_ops',
    title: WIDGET_LABELS.daily_ops,
    href: '/api/cron/daily-ops?preview=true',
    count: stats.totalRuns,
    severity: hasFailedRecently ? 'critical' : (mbrOverdue.overdueCount > 0 ? 'warning' : 'info'),
    lastRunAt: stats.lastSuccessfulRun?.startedAt ?? stats.lastFailedRun?.startedAt ?? null,
    lastRunOk: stats.lastSuccessfulRun ? true : (stats.lastFailedRun ? false : null),
    totalRuns: stats.totalRuns,
    hasFailedRecently,
    // Ticket 067: 失敗ステップ名を表示
    failedSteps: failedSteps.length > 0 ? failedSteps : undefined,
    // Ticket 130: MBR改善タスク期限超過件数
    mbrOverdueCount: mbrOverdue.overdueCount > 0 ? mbrOverdue.overdueCount : undefined,
    isEmpty: stats.totalRuns === 0,
  };
}

/**
 * 週次オペウィジェットを構築（Ticket 067: weekly-opsリポジトリ連携）
 */
export function buildWeeklyOpsWidget(): WeeklyOpsWidget {
  const stats = getWeeklyOpsStats();
  const failedSteps = getWeeklyFailedSteps();
  const hasFailedRecently = hasWeeklyFailedRecently();

  // 今週の金曜日を計算（WBR期限）
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  const friday = new Date(today);
  friday.setDate(today.getDate() + daysUntilFriday);

  return {
    type: 'weekly_ops',
    title: WIDGET_LABELS.weekly_ops,
    href: '/dashboard/wbr',
    count: stats.totalRuns,
    severity: hasFailedRecently ? 'critical' : 'info',
    lastRunAt: stats.lastRunAt,
    lastRunOk: stats.lastRunOk,
    wbrDueDate: friday.toISOString().split('T')[0],
    // Ticket 067: 失敗情報
    hasFailedRecently,
    failedSteps: failedSteps.length > 0 ? failedSteps : undefined,
    isEmpty: stats.totalRuns === 0,
  };
}

/**
 * 事業サマリーウィジェットを構築
 */
export function buildBusinessSummaryWidget(userId: string, role: AppRole): BusinessSummaryWidget {
  const viewer = createViewerContext(userId, role);
  const overviews = getBusinessSummaryOverviews(viewer);

  const hasCritical = overviews.some(o => o.riskLevel === 'critical');
  const hasWarning = overviews.some(o => o.riskLevel === 'warning');

  const businessUnits = overviews.map(o => ({
    id: o.unit.id,
    name: o.unit.name,
    status: o.riskLevel === 'normal' ? 'good' as const : o.riskLevel,
  }));

  let severity: AlertSeverity = 'info';
  if (hasCritical) severity = 'critical';
  else if (hasWarning) severity = 'warning';

  return {
    type: 'business_summary',
    title: WIDGET_LABELS.business_summary,
    href: '/dashboard/business-summary',
    count: overviews.length,
    severity,
    businessUnits,
    isEmpty: overviews.length === 0,
  };
}

/**
 * 未収金ウィジェットを構築
 */
export function buildReceivablesWidget(userId: string, role: AppRole): ReceivablesWidget {
  const viewer = createViewerContext(userId, role);
  const stats = getReceivablesStats(viewer);

  if (!stats) {
    return {
      type: 'receivables',
      title: WIDGET_LABELS.receivables,
      href: '/dashboard/receivables',
      count: 0,
      severity: 'info',
      totalOverdue: 0,
      overdueAmount: 0,
      criticalCount: 0,
      isEmpty: true,
    };
  }

  let severity: AlertSeverity = 'info';
  if (stats.criticalOverdueCount > 0 || stats.overdueTotal >= 1000000) severity = 'critical';
  else if (stats.overdueCount > 0) severity = 'warning';

  return {
    type: 'receivables',
    title: WIDGET_LABELS.receivables,
    href: '/dashboard/receivables',
    count: stats.overdueCount,
    severity,
    totalOverdue: stats.overdueCount,
    overdueAmount: stats.overdueTotal,
    criticalCount: stats.criticalOverdueCount,
    isEmpty: stats.overdueCount === 0,
  };
}

/**
 * AI副社長Top3ウィジェットを構築
 */
export function buildAIVPTop3Widget(userId: string, role: AppRole): AIVPTop3Widget {
  const viewer = createViewerContext(userId, role);
  const overviews = getBusinessSummaryOverviews(viewer);

  // 重要度が高い順にソート → Top3
  const sorted = [...overviews].sort((a, b) => {
    const severityOrder: Record<string, number> = { critical: 3, warning: 2, normal: 1 };
    return (severityOrder[b.riskLevel] ?? 0) - (severityOrder[a.riskLevel] ?? 0);
  });
  const top3 = sorted.slice(0, 3);

  const businessUnits = top3.map(o => ({
    id: o.unit.id,
    name: o.unit.name,
    topIssue: o.criticalIssues > 0 ? `重大${o.criticalIssues}件` : `課題${o.totalIssues}件`,
    severity: (o.riskLevel === 'critical' ? 'critical' : o.riskLevel === 'warning' ? 'warning' : 'info') as AlertSeverity,
  }));

  const hasCritical = top3.some(o => o.riskLevel === 'critical');

  return {
    type: 'ai_vp_top3',
    title: WIDGET_LABELS.ai_vp_top3,
    href: '/dashboard/ai-vp',
    count: top3.length,
    severity: hasCritical ? 'critical' : (top3.length > 0 ? 'warning' : 'info'),
    businessUnits,
    isEmpty: top3.length === 0,
  };
}

/**
 * Task 053: 契約ウィジェットを構築
 */
export function buildContractsWidget(): ContractsWidget {
  const expiring = scanExpiringContracts(30);
  const decisionOverdue = scanDecisionOverdueContracts();
  const highRiskExpiring = expiring.filter(c => c.daysUntilEnd <= 7);

  const total = expiring.length + decisionOverdue.length;

  let severity: AlertSeverity = 'info';
  if (highRiskExpiring.length > 0 || decisionOverdue.length >= 3) severity = 'critical';
  else if (total > 0) severity = 'warning';

  return {
    type: 'contracts',
    title: WIDGET_LABELS.contracts,
    href: '/dashboard/contracts',
    count: total,
    severity,
    expiringSoon: expiring.length,
    decisionOverdue: decisionOverdue.length,
    highRiskExpiring: highRiskExpiring.length,
    isEmpty: total === 0,
  };
}

/**
 * Task 053: OSマップウィジェットを構築
 */
export function buildOsMapWidget(): OsMapWidget {
  const visibleFeatures = OS_FEATURES.filter(f => f.status !== 'hidden');
  const total = visibleFeatures.length;
  const active = visibleFeatures.filter(f => f.status === 'active').length;
  const progressPercent = total > 0 ? Math.round((active / total) * 100) : 0;

  return {
    type: 'os_map',
    title: WIDGET_LABELS.os_map,
    href: '/dashboard/os-map',
    count: total,
    severity: progressPercent < 50 ? 'warning' : 'info',
    totalFeatures: total,
    activeFeatures: active,
    progressPercent,
    isEmpty: false,
  };
}

/**
 * Task 053: 品質/リスク統合ウィジェットを構築
 */
export function buildQualityRiskWidget(): QualityRiskWidget {
  // アラート・是正措置・修繕を統合して品質リスクを集計
  const alertStats = getAlertStats();
  const caViewer = createViewerContext('system', 'admin' as AppRole);
  const caStats = getCorrectiveActionsStats(caViewer);
  const repairViewer = createViewerContext('system', 'admin' as AppRole);
  const repairStats = getRepairsStats(repairViewer);

  const highRiskCount = alertStats.criticalOpen + (repairStats.highRiskOpen || 0);
  const incidentCount = alertStats.open;
  const overdueActions = caStats.overdue + repairStats.overdue;
  const total = highRiskCount + incidentCount + overdueActions;

  let severity: AlertSeverity = 'info';
  if (highRiskCount > 0) severity = 'critical';
  else if (overdueActions > 0) severity = 'warning';

  return {
    type: 'quality_risk',
    title: WIDGET_LABELS.quality_risk,
    href: '/dashboard/quality',
    count: total,
    severity,
    highRiskCount,
    incidentCount,
    overdueActions,
    isEmpty: total === 0,
  };
}

/**
 * Ticket 127: MBRウィジェットを構築
 */
export function buildMbrWidget(): MbrWidget {
  const mbrs = listMbrs(1);
  const latest = mbrs[0] ?? null;

  const available = latest !== null;

  return {
    type: 'mbr',
    title: WIDGET_LABELS.mbr,
    href: '/dashboard/mbr',
    severity: available ? 'info' : 'warning',
    latestMonth: latest?.month ?? null,
    generatedAt: latest?.generatedAt ?? null,
    available,
    isEmpty: false, // 未生成でも warning カードを表示
  };
}

/**
 * Ticket 082: 空室問い合わせKPIウィジェットを構築
 */
export function buildVacancyInquiryKpisWidget(userId: string, role: AppRole): VacancyInquiryKpisWidget {
  // tickets/types の ViewerContext を使用
  const viewer = { userId, role };

  // チケット一覧を取得（vacancy_inquiry のみ）
  const { items: tickets } = listTickets(
    { pipeline: 'vacancy_inquiry', limit: 1000 },
    viewer
  );

  // イベント一覧を取得（関連チケットのみ）
  const ticketIds = tickets.map(t => t.id);
  const events = ticketIds.flatMap(id => listTicketEvents(id));

  // KPI集計（直近7日）
  const kpiResult = buildAssigneeKpis(tickets, events, { days: 7 });

  // 重要度判定
  let severity: AlertSeverity = 'info';
  if (kpiResult.summary.totalSlaBreach > 0) severity = 'warning';
  if (kpiResult.summary.overallSlaOkRate < 0.7) severity = 'critical';

  return {
    type: 'vacancy_inquiry_kpis',
    title: WIDGET_LABELS.vacancy_inquiry_kpis,
    href: '/dashboard/vacancy-inquiries',
    count: kpiResult.summary.totalInquiries,
    severity,
    assignees: kpiResult.rows,
    summary: kpiResult.summary,
    periodDays: kpiResult.period.days,
    isEmpty: kpiResult.summary.totalInquiries === 0,
  };
}

/**
 * Ticket 122: 営業タスクウィジェットを構築
 */
export function buildSalesTasksWidget(userId: string, role: AppRole): SalesTasksWidget {
  const viewer = { userId, role };
  const isStaffOrLeader = ['staff', 'leader'].includes(role);

  // sales_next_action チケットを取得
  const { items: salesTasks } = listTickets(
    {
      relatedType: 'sales_next_action',
      limit: 100,
    },
    viewer
  );

  // open/in_progress/waiting のみ対象
  const openTasks = salesTasks.filter(t =>
    ['open', 'in_progress', 'waiting'].includes(t.status)
  );

  // 今日の日付
  const today = new Date().toISOString().split('T')[0];

  // 期限超過件数
  const overdue = openTasks.filter(t => t.dueAt && t.dueAt < today).length;

  // staff/leader: 自分の担当のみ
  const myTasks = isStaffOrLeader
    ? openTasks.filter(t => t.assigneeUserId === userId)
    : [];

  // 上位3件（dueAt近い順）
  const sortedMyTasks = [...myTasks].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.localeCompare(b.dueAt);
  });
  const topTasks = sortedMyTasks.slice(0, 3).map(t => ({
    id: t.id,
    title: t.title.length > 30 ? t.title.slice(0, 30) + '...' : t.title,
    dueAt: t.dueAt ?? null,
  }));

  // 重要度判定
  let severity: AlertSeverity = 'info';
  if (overdue > 0) severity = 'warning';
  if (overdue >= 5) severity = 'critical';

  // staff/leader と manager/admin で表示内容を分岐
  if (isStaffOrLeader) {
    return {
      type: 'sales_tasks',
      title: '今日の営業タスク',
      href: `/dashboard/tickets?relatedType=sales_next_action&assigneeUserId=${userId}`,
      count: myTasks.length,
      severity: myTasks.some(t => t.dueAt && t.dueAt < today) ? 'warning' : 'info',
      mySalesTasksToday: myTasks.length,
      myTopTasks: topTasks,
      isEmpty: myTasks.length === 0,
    };
  }

  // manager/admin: 全体の状況
  return {
    type: 'sales_tasks',
    title: '営業タスク状況',
    href: '/dashboard/tickets?relatedType=sales_next_action',
    count: openTasks.length,
    severity,
    salesTasksToday: openTasks.length,
    salesTasksOverdue: overdue,
    isEmpty: openTasks.length === 0,
  };
}

/**
 * ウィジェットタイプに応じてウィジェットを構築
 */
export function buildWidget(
  widgetType: WidgetType,
  userId: string,
  role: AppRole
): Widget {
  switch (widgetType) {
    case 'alerts':
      return buildAlertsWidget();
    case 'unclassified':
      return buildUnclassifiedWidget();
    case 'ai_vp_top3':
      return buildAIVPTop3Widget(userId, role);
    case 'business_summary':
      return buildBusinessSummaryWidget(userId, role);
    case 'tickets':
      return buildTicketsWidget(userId, role);
    case 'repairs':
      return buildRepairsWidget(userId, role);
    case 'corrective_actions':
      return buildCorrectiveActionsWidget(userId, role);
    case 'licenses':
      return buildLicensesWidget(userId, role);
    case 'training':
      return buildTrainingWidget(userId, role);
    case 'handover':
      return buildHandoverWidget(userId, role);
    case 'announcements':
      return buildAnnouncementsWidget(userId, role);
    case 'daily_ops':
      return buildDailyOpsWidget();
    case 'weekly_ops':
      return buildWeeklyOpsWidget();
    case 'receivables':
      return buildReceivablesWidget(userId, role);
    // Task 053: 新規ウィジェット
    case 'contracts':
      return buildContractsWidget();
    case 'os_map':
      return buildOsMapWidget();
    case 'quality_risk':
      return buildQualityRiskWidget();
    // Ticket 127: MBRウィジェット
    case 'mbr':
      return buildMbrWidget();
    // Ticket 082: 空室問い合わせKPI
    case 'vacancy_inquiry_kpis':
      return buildVacancyInquiryKpisWidget(userId, role);
    // Ticket 122: 営業タスク
    case 'sales_tasks':
      return buildSalesTasksWidget(userId, role);
    default:
      return {
        type: widgetType,
        title: WIDGET_LABELS[widgetType] ?? widgetType,
        isEmpty: true,
      };
  }
}

/**
 * 役職に応じた全ウィジェットを構築
 */
export function buildWidgetsForRole(
  role: AppRole,
  userId: string,
  widgetTypes: WidgetType[]
): Widget[] {
  return widgetTypes.map(type => buildWidget(type, userId, role));
}
