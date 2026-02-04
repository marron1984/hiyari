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
  OpsReportWidget,
} from './types';
import { WIDGET_LABELS } from './types';
import type { ViewerContext } from '@/lib/business/types';
import type { AlertSeverity } from '@/lib/alerts/types';

// リポジトリインポート
import { getAlertStats, listAlerts } from '@/lib/alerts/repo';
import { getUnclassifiedCounts } from '@/lib/scope/detectUnclassifiedBusinessUnit';
import { getTicketStats } from '@/lib/tickets/repo';
import { getStats as getRepairsStats } from '@/lib/repairs/repo';
import { getStats as getCorrectiveActionsStats } from '@/lib/correctiveActions/repo';
import { scanExpiring, scanExpired } from '@/lib/licenses/repo';
import { getRunStats as getDailyOpsStats, listRecentRuns as listDailyOpsRuns } from '@/lib/dailyOps/repo';
import { getStats as getReceivablesStats } from '@/lib/receivables/repo';
import { countUnreadHandoverItems } from '@/lib/handover/repo';
import { listAnnouncementsForUser } from '@/lib/announcements/store';
import { listReadIds } from '@/lib/readTracking/repo';

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
  // TODO: 研修リポジトリと連携（現在はモック）
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
 * 日次オペウィジェットを構築
 */
export function buildDailyOpsWidget(): DailyOpsWidget {
  const stats = getDailyOpsStats();
  const recentRuns = listDailyOpsRuns(5);

  const hasFailedRecently = stats.lastFailedRun !== null &&
    (!stats.lastSuccessfulRun ||
      new Date(stats.lastFailedRun.startedAt) > new Date(stats.lastSuccessfulRun.startedAt));

  return {
    type: 'daily_ops',
    title: WIDGET_LABELS.daily_ops,
    href: '/api/cron/daily-ops?preview=true',
    count: stats.totalRuns,
    severity: hasFailedRecently ? 'critical' : 'info',
    lastRunAt: stats.lastSuccessfulRun?.startedAt ?? stats.lastFailedRun?.startedAt ?? null,
    lastRunOk: stats.lastSuccessfulRun ? true : (stats.lastFailedRun ? false : null),
    totalRuns: stats.totalRuns,
    hasFailedRecently,
    isEmpty: stats.totalRuns === 0,
  };
}

/**
 * 週次オペウィジェットを構築
 */
export function buildWeeklyOpsWidget(): WeeklyOpsWidget {
  // TODO: 週次オペリポジトリと連携
  // 現在は WBR への導線として機能

  // 今週の金曜日を計算
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  const friday = new Date(today);
  friday.setDate(today.getDate() + daysUntilFriday);

  return {
    type: 'weekly_ops',
    title: WIDGET_LABELS.weekly_ops,
    href: '/dashboard/wbr',
    count: 0,
    severity: 'info',
    lastRunAt: null,
    lastRunOk: null,
    wbrDueDate: friday.toISOString().split('T')[0],
    isEmpty: true,
  };
}

/**
 * 事業サマリーウィジェットを構築
 */
export function buildBusinessSummaryWidget(): BusinessSummaryWidget {
  // TODO: 事業別サマリーAPIと連携
  return {
    type: 'business_summary',
    title: WIDGET_LABELS.business_summary,
    href: '/dashboard/business-summary',
    count: 0,
    severity: 'info',
    businessUnits: [],
    isEmpty: true,
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
export function buildAIVPTop3Widget(): AIVPTop3Widget {
  // TODO: businessTop3と連携
  return {
    type: 'ai_vp_top3',
    title: WIDGET_LABELS.ai_vp_top3,
    href: '/dashboard/ai-vp',
    count: 0,
    severity: 'info',
    businessUnits: [],
    isEmpty: true,
  };
}

/**
 * Task 053: 契約ウィジェットを構築
 */
export function buildContractsWidget(): ContractsWidget {
  // TODO: contracts リポジトリと連携
  // 期限間近・判断期限超過・高リスク期限間近をカウント
  return {
    type: 'contracts',
    title: WIDGET_LABELS.contracts,
    href: '/dashboard/contracts',
    count: 0,
    severity: 'info',
    expiringSoon: 0,
    decisionOverdue: 0,
    highRiskExpiring: 0,
    isEmpty: true,
  };
}

/**
 * Task 053: OSマップウィジェットを構築
 */
export function buildOsMapWidget(): OsMapWidget {
  // TODO: OS_FEATURES から統計を取得
  return {
    type: 'os_map',
    title: WIDGET_LABELS.os_map,
    href: '/dashboard/os-map',
    count: 0,
    severity: 'info',
    totalFeatures: 0,
    activeFeatures: 0,
    progressPercent: 0,
    isEmpty: true,
  };
}

/**
 * Task 053: 品質/リスク統合ウィジェットを構築
 */
export function buildQualityRiskWidget(): QualityRiskWidget {
  // TODO: 品質関連リポジトリと連携
  return {
    type: 'quality_risk',
    title: WIDGET_LABELS.quality_risk,
    href: '/dashboard/quality',
    count: 0,
    severity: 'info',
    highRiskCount: 0,
    incidentCount: 0,
    overdueActions: 0,
    isEmpty: true,
  };
}

/**
 * Task 066: 運用レポートウィジェットを構築
 *
 * manager/admin向けの運用状況サマリー
 * - daily-ops / weekly-ops の実行状態
 * - system_error アラート件数
 * - 未分類スコープ件数
 * - critical アラート件数
 */
export function buildOpsReportWidget(): OpsReportWidget {
  // daily-ops の実行状況を取得
  const dailyStats = getDailyOpsStats();
  const dailyOk = dailyStats.lastSuccessfulRun ? true : (dailyStats.lastFailedRun ? false : null);
  const lastDailyRunAt = dailyStats.lastSuccessfulRun?.startedAt ??
    dailyStats.lastFailedRun?.startedAt ?? null;

  // アラート統計を取得
  const alertStats = getAlertStats();

  // 未分類スコープを取得
  const unclassified = getUnclassifiedCounts();

  // system_error アラートをカウント（openかつtype=system_error）
  const { alerts: systemErrorAlerts } = listAlerts({ status: 'open', limit: 100 });
  const systemErrorOpen = systemErrorAlerts.filter(
    a => a.type === 'system_error'
  ).length;

  // 重要度判定
  let severity: AlertSeverity = 'info';
  if (dailyOk === false || alertStats.criticalOpen > 0 || systemErrorOpen > 0) {
    severity = 'critical';
  } else if (unclassified.total > 0) {
    severity = 'warning';
  }

  return {
    type: 'ops_report',
    title: WIDGET_LABELS.ops_report,
    href: '/dashboard/ops-report',
    count: alertStats.criticalOpen + systemErrorOpen + unclassified.total,
    severity,
    dailyOk,
    weeklyOk: null, // TODO: weekly-ops リポジトリと連携
    systemErrorOpen,
    unclassifiedOpen: unclassified.total,
    criticalOpen: alertStats.criticalOpen,
    lastDailyRunAt,
    lastWeeklyRunAt: null, // TODO: weekly-ops リポジトリと連携
    isEmpty: false,
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
      return buildAIVPTop3Widget();
    case 'business_summary':
      return buildBusinessSummaryWidget();
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
    // Task 066: 運用レポート
    case 'ops_report':
      return buildOpsReportWidget();
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
