/**
 * Today's Top3 ビルダー
 *
 * Implementation Ticket 060: 朝イチダイジェスト通知（055）と Role Home（059）を連動
 *
 * 役職別に「今日のTop3」を生成する共通ロジック
 * - Role Home と ダイジェスト通知で同じロジックを使う
 * - businessTop3.ts のロジックを再利用しつつ、役職別に最適化
 */

import type { AppRole } from '@/config/appRoles';
import type { ViewerContext } from '@/lib/business/types';
import type { AlertSeverity } from '@/lib/alerts/types';
import {
  getAllBusinessTop3,
  getAlertTop3,
  type ActionCandidate,
  type BusinessTop3Summary,
} from '@/lib/aiVp/businessTop3';
import { buildAlertsWidget, buildTicketsWidget, buildCorrectiveActionsWidget } from '@/lib/roleHome/widgetBuilder';

// ========== 型定義 ==========

export interface TodayTop3Item {
  id: string;
  title: string;
  reason: string;
  severity: AlertSeverity;
  url: string;
  domain: string;  // alerts, tickets, repairs, licenses, etc.
  count?: number;
}

export interface TodayTop3Result {
  role: AppRole;
  date: string;  // YYYY-MM-DD
  items: TodayTop3Item[];
  generatedAt: string;
}

// ========== ロール別優先度設定 ==========

/**
 * ロール別の優先ドメイン
 * 優先度の高いドメインから順に並べる
 */
const ROLE_DOMAIN_PRIORITY: Record<AppRole, string[]> = {
  staff: ['tickets', 'training', 'licenses', 'handover'],
  leader: ['tickets', 'repairs', 'alerts', 'handover'],
  manager: ['alerts', 'correctiveActions', 'tickets', 'repairs', 'licenses'],
  executive: ['alerts', 'correctiveActions', 'tickets', 'receivables'],
  admin: ['alerts', 'correctiveActions', 'tickets', 'repairs', 'licenses'],
  auditor: ['alerts', 'correctiveActions', 'tickets'],
};

// ========== メイン関数 ==========

/**
 * 役職別の今日のTop3を生成
 *
 * @param role 役職
 * @param userId ユーザーID
 * @returns Top3アイテムリスト
 */
export function buildTodayTop3(
  role: AppRole,
  userId: string
): TodayTop3Result {
  const viewer: ViewerContext = { userId, role };
  const today = new Date().toISOString().slice(0, 10);
  const items: TodayTop3Item[] = [];

  // 1. AI VP Business Top3 から候補を取得
  const businessTop3 = getAllBusinessTop3(viewer);
  const aiVpItems = convertBusinessTop3ToItems(businessTop3);

  // 2. アラートTop3
  const alertItems = convertAlertTop3ToItems(getAlertTop3(viewer));

  // 3. ウィジェットから追加アイテムを生成
  const widgetItems = buildWidgetBasedItems(role, userId);

  // 4. 全候補をマージしてロール別優先度でソート
  const allCandidates = [...aiVpItems, ...alertItems, ...widgetItems];

  // 重複排除（urlベース）
  const seen = new Set<string>();
  const uniqueCandidates = allCandidates.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  // ロール別優先度でソート
  const priorityDomains = ROLE_DOMAIN_PRIORITY[role] || [];
  uniqueCandidates.sort((a, b) => {
    // severity 優先
    const severityOrder: Record<AlertSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // domain 優先度
    const aPriority = priorityDomains.indexOf(a.domain);
    const bPriority = priorityDomains.indexOf(b.domain);
    const aIdx = aPriority === -1 ? 999 : aPriority;
    const bIdx = bPriority === -1 ? 999 : bPriority;
    return aIdx - bIdx;
  });

  // Top3を選択
  items.push(...uniqueCandidates.slice(0, 3));

  return {
    role,
    date: today,
    items,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 複数ロール向けのTop3を一括生成
 */
export function buildTodayTop3ForRoles(
  roles: AppRole[],
  userIdsByRole: Map<AppRole, string>
): Map<AppRole, TodayTop3Result> {
  const results = new Map<AppRole, TodayTop3Result>();

  for (const role of roles) {
    const userId = userIdsByRole.get(role) || 'system';
    results.set(role, buildTodayTop3(role, userId));
  }

  return results;
}

// ========== 変換ヘルパー ==========

/**
 * BusinessTop3Summary を TodayTop3Item[] に変換
 */
function convertBusinessTop3ToItems(summary: BusinessTop3Summary): TodayTop3Item[] {
  return summary.topActions.map(action => ({
    id: action.key,
    title: action.title,
    reason: action.reason,
    severity: action.severity,
    url: action.url,
    domain: action.domain,
    count: action.count,
  }));
}

/**
 * AlertTop3 を TodayTop3Item[] に変換
 */
function convertAlertTop3ToItems(alerts: ActionCandidate[]): TodayTop3Item[] {
  return alerts.map(alert => ({
    id: alert.key,
    title: alert.title,
    reason: alert.reason,
    severity: alert.severity,
    url: alert.url,
    domain: 'alerts',
    count: alert.count,
  }));
}

/**
 * ウィジェットベースのアイテムを生成
 */
function buildWidgetBasedItems(role: AppRole, userId: string): TodayTop3Item[] {
  const items: TodayTop3Item[] = [];

  // アラートウィジェットから
  const alertsWidget = buildAlertsWidget();
  if (alertsWidget.criticalOpen > 0) {
    items.push({
      id: 'widget:alerts:critical',
      title: `重大アラート ${alertsWidget.criticalOpen}件`,
      reason: '重大なアラートが発生しています。確認が必要です。',
      severity: 'critical',
      url: '/dashboard/alerts?severity=critical',
      domain: 'alerts',
      count: alertsWidget.criticalOpen,
    });
  }

  // チケットウィジェットから
  const ticketsWidget = buildTicketsWidget(userId, role);
  if (ticketsWidget.overdue > 0) {
    items.push({
      id: 'widget:tickets:overdue',
      title: `期限超過チケット ${ticketsWidget.overdue}件`,
      reason: '対応期限を超過したチケットがあります。',
      severity: 'warning',
      url: '/dashboard/tickets?status=overdue',
      domain: 'tickets',
      count: ticketsWidget.overdue,
    });
  }
  if (ticketsWidget.urgentOpen > 0) {
    items.push({
      id: 'widget:tickets:urgent',
      title: `緊急チケット ${ticketsWidget.urgentOpen}件`,
      reason: '優先度「緊急」のチケットが未対応です。',
      severity: 'warning',
      url: '/dashboard/tickets?priority=urgent',
      domain: 'tickets',
      count: ticketsWidget.urgentOpen,
    });
  }

  // 是正措置ウィジェットから
  const caWidget = buildCorrectiveActionsWidget(userId, role);
  if (caWidget.criticalOpen > 0) {
    items.push({
      id: 'widget:ca:critical',
      title: `重大是正措置 ${caWidget.criticalOpen}件`,
      reason: '重大な是正措置が未完了です。',
      severity: 'critical',
      url: '/dashboard/corrective-actions?severity=critical',
      domain: 'correctiveActions',
      count: caWidget.criticalOpen,
    });
  }
  if (caWidget.overdue > 0) {
    items.push({
      id: 'widget:ca:overdue',
      title: `期限超過是正措置 ${caWidget.overdue}件`,
      reason: '是正措置の期限を超過しています。',
      severity: 'warning',
      url: '/dashboard/corrective-actions?status=overdue',
      domain: 'correctiveActions',
      count: caWidget.overdue,
    });
  }

  return items;
}

// ========== フォーマットヘルパー ==========

/**
 * Top3を通知用テキストに変換
 */
export function formatTop3AsText(result: TodayTop3Result): string[] {
  if (result.items.length === 0) {
    return ['本日の重要タスクはありません'];
  }

  return result.items.map((item, index) => {
    const severityEmoji = item.severity === 'critical' ? '!' : item.severity === 'warning' ? '>' : '-';
    return `${index + 1}. [${severityEmoji}] ${item.title}`;
  });
}

/**
 * Top3を1行サマリーに変換
 */
export function formatTop3AsSummary(result: TodayTop3Result): string {
  if (result.items.length === 0) {
    return '本日の重要タスクはありません';
  }

  const criticalCount = result.items.filter(i => i.severity === 'critical').length;
  const warningCount = result.items.filter(i => i.severity === 'warning').length;

  const parts: string[] = [];
  if (criticalCount > 0) parts.push(`重大${criticalCount}件`);
  if (warningCount > 0) parts.push(`警告${warningCount}件`);

  return `今日のTop3: ${parts.join('、')}（${result.items[0].title}など）`;
}
