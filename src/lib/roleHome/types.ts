/**
 * 役職別ホーム（Role Home）型定義
 *
 * Implementation Ticket 046: 毎朝見る画面を固定する
 */

import type { AppRole } from '@/config/appRoles';
import type { AlertSeverity } from '@/lib/alerts/types';

/**
 * ウィジェットの種類
 */
export type WidgetType =
  | 'alerts'             // アラート（重要度別）
  | 'unclassified'       // 未分類スコープ
  | 'ai_vp_top3'         // AI副社長 事業別Top3
  | 'business_summary'   // 事業別サマリー
  | 'tickets'            // チケット（自分の担当/overdue）
  | 'repairs'            // 修繕（自分の担当/high-risk）
  | 'corrective_actions' // 是正措置（overdue/urgent）
  | 'licenses'           // 資格期限
  | 'training'           // 研修未受講
  | 'handover'           // 申し送り未読
  | 'announcements'      // 周知未読
  | 'daily_ops'          // 日次オペ実行ログ
  | 'weekly_ops'         // 週次オペ実行ログ
  | 'os_map'             // OSマップリンク
  | 'quality_risk'       // 品質/リスク統合
  | 'contracts'          // 契約/未収ハイライト
  | 'receivables';       // 未収金

/**
 * ウィジェット共通インターフェース
 */
export interface BaseWidget {
  type: WidgetType;
  title: string;
  href?: string;          // リンク先
  count?: number;         // 件数
  severity?: AlertSeverity; // 最も高い重要度
  isEmpty?: boolean;      // データなし
}

/**
 * アラートウィジェット
 */
export interface AlertsWidget extends BaseWidget {
  type: 'alerts';
  criticalOpen: number;
  warningOpen: number;
  totalOpen: number;
}

/**
 * 未分類ウィジェット
 */
export interface UnclassifiedWidget extends BaseWidget {
  type: 'unclassified';
  tickets: number;
  repairs: number;
  correctiveActions: number;
  total: number;
}

/**
 * AI副社長Top3ウィジェット
 */
export interface AIVPTop3Widget extends BaseWidget {
  type: 'ai_vp_top3';
  businessUnits: Array<{
    id: string;
    name: string;
    topIssue: string;
    severity: AlertSeverity;
  }>;
}

/**
 * チケットウィジェット
 */
export interface TicketsWidget extends BaseWidget {
  type: 'tickets';
  myAssignedOpen: number;
  myRequestedOpen: number;
  overdue: number;
  urgentOpen: number;
}

/**
 * 修繕ウィジェット
 */
export interface RepairsWidget extends BaseWidget {
  type: 'repairs';
  open: number;
  highRiskOpen: number;
  overdue: number;
}

/**
 * 是正措置ウィジェット
 */
export interface CorrectiveActionsWidget extends BaseWidget {
  type: 'corrective_actions';
  open: number;
  criticalOpen: number;
  overdue: number;
}

/**
 * 資格ウィジェット
 */
export interface LicensesWidget extends BaseWidget {
  type: 'licenses';
  expired: number;
  expiringSoon: number;  // 30日以内
  myExpiringSoon?: number; // 自分の期限切れ間近
}

/**
 * 研修ウィジェット
 */
export interface TrainingWidget extends BaseWidget {
  type: 'training';
  notCompleted: number;
  myNotCompleted?: number;
}

/**
 * 申し送りウィジェット
 */
export interface HandoverWidget extends BaseWidget {
  type: 'handover';
  unread: number;
  urgent: number;
}

/**
 * 周知ウィジェット
 */
export interface AnnouncementsWidget extends BaseWidget {
  type: 'announcements';
  unread: number;
}

/**
 * 日次オペウィジェット
 */
export interface DailyOpsWidget extends BaseWidget {
  type: 'daily_ops';
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  totalRuns: number;
  hasFailedRecently: boolean;
}

/**
 * 週次オペウィジェット
 */
export interface WeeklyOpsWidget extends BaseWidget {
  type: 'weekly_ops';
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  wbrDueDate: string | null;
}

/**
 * 事業サマリーウィジェット
 */
export interface BusinessSummaryWidget extends BaseWidget {
  type: 'business_summary';
  businessUnits: Array<{
    id: string;
    name: string;
    status: 'good' | 'warning' | 'critical';
  }>;
}

/**
 * 未収金ウィジェット
 */
export interface ReceivablesWidget extends BaseWidget {
  type: 'receivables';
  totalOverdue: number;
  overdueAmount: number;
  criticalCount: number;
}

/**
 * ウィジェット型のユニオン
 */
export type Widget =
  | AlertsWidget
  | UnclassifiedWidget
  | AIVPTop3Widget
  | TicketsWidget
  | RepairsWidget
  | CorrectiveActionsWidget
  | LicensesWidget
  | TrainingWidget
  | HandoverWidget
  | AnnouncementsWidget
  | DailyOpsWidget
  | WeeklyOpsWidget
  | BusinessSummaryWidget
  | ReceivablesWidget
  | BaseWidget;

/**
 * 役職別ホーム設定
 */
export interface RoleHomeConfig {
  role: AppRole;
  title: string;
  subtitle: string;
  widgets: WidgetType[];
}

/**
 * 役職別ホームデータ
 */
export interface RoleHomeData {
  role: AppRole;
  roleName: string;
  widgets: Widget[];
  fetchedAt: string;
}

/**
 * 役職別ウィジェット設定
 *
 * Implementation Ticket 046-final: 役職別並び確定
 * - staff: 自分のタスク中心、周知・申し送り
 * - leader: チーム管理、担当範囲のチケット・修繕
 * - manager: 担当範囲全体、是正・アラート・未分類
 * - executive: 事業全体俯瞰、AI副社長Top3
 * - admin: システム運用、日次/週次オペ
 */
export const ROLE_WIDGET_CONFIG: Record<AppRole, WidgetType[]> = {
  // staff: 自分のタスク中心
  staff: [
    'tickets',        // 自分の担当/依頼
    'training',       // 研修未受講（自分）
    'licenses',       // 資格期限（自分）
    'announcements',  // 周知未読
    'handover',       // 申し送り未読
  ],

  // leader: チーム管理
  leader: [
    'tickets',        // 担当チケット
    'repairs',        // 担当修繕
    'handover',       // 申し送り
    'alerts',         // チーム向けアラート
    'training',       // チーム研修状況
  ],

  // manager: 担当範囲全体
  manager: [
    'tickets',            // 担当範囲チケット
    'repairs',            // 担当範囲修繕
    'corrective_actions', // 是正措置
    'alerts',             // アラート
    'licenses',           // 資格期限（チーム）
    'unclassified',       // 未分類スコープ
    'receivables',        // 未収金
    'daily_ops',          // 日次オペログ（参照）
  ],

  // executive: 事業全体俯瞰
  executive: [
    'ai_vp_top3',         // AI副社長 事業別Top3
    'alerts',             // 重大アラート
    'business_summary',   // 事業別サマリー
    'receivables',        // 未収金ハイライト
    'unclassified',       // 未分類スコープ
    'weekly_ops',         // WBRへの導線
  ],

  // admin: システム運用・全体管理
  admin: [
    'alerts',             // アラート（全社）
    'unclassified',       // 未分類スコープ
    'daily_ops',          // 日次オペ（実行ボタン付き）
    'weekly_ops',         // 週次オペ（実行ボタン付き）
    'tickets',            // チケット全体
    'repairs',            // 修繕全体
    'corrective_actions', // 是正措置
    'licenses',           // 資格期限
    'receivables',        // 未収金
  ],

  // auditor: 監査用ビュー
  auditor: [
    'alerts',
    'corrective_actions',
    'unclassified',
    'daily_ops',
    'weekly_ops',
  ],
};

/**
 * ウィジェット表示名
 */
export const WIDGET_LABELS: Record<WidgetType, string> = {
  alerts: 'アラート',
  unclassified: '未分類スコープ',
  ai_vp_top3: 'AI副社長 Top3',
  business_summary: '事業サマリー',
  tickets: 'チケット',
  repairs: '修繕',
  corrective_actions: '是正措置',
  licenses: '資格',
  training: '研修',
  handover: '申し送り',
  announcements: '周知',
  daily_ops: '日次オペ',
  weekly_ops: '週次オペ',
  os_map: 'OSマップ',
  quality_risk: '品質/リスク',
  contracts: '契約',
  receivables: '未収金',
};
