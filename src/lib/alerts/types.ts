/**
 * アラートセンター 型定義
 *
 * 全種類のアラートを統一的に管理するための型定義
 */

/**
 * アラート種別
 */
export type AlertType =
  | 'kpi_anomaly'       // KPI異常
  | 'approval_backlog'  // 承認滞留
  | 'deadline_overdue'  // 期限超過
  | 'system_error'      // システムエラー
  | 'handover_urgent'   // 重要申し送り
  | 'ticket_backlog'    // チケット滞留
  | 'training_overdue'  // 研修期限超過
  | 'committee_risk'    // 委員会リスク
  | 'complaint_risk'    // クレームリスク
  | 'receivable_risk'   // 未収リスク
  | 'collection_flow_risk';  // 回収フローリスク

/**
 * アラート重要度
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * アラートステータス
 */
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

/**
 * アラートイベントアクション
 */
export type AlertEventAction = 'create' | 'notify' | 'ack' | 'resolve' | 'comment';

/**
 * アラート
 */
export interface Alert {
  id: string;
  type: AlertType;
  sourceId: string | null;  // kpiId, approvalFlowId, contractId など
  title: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  fingerprint: string;      // 重複抑制キー
  assignedRole?: string | null;
  assignedUserId?: string | null;
  meta?: Record<string, unknown> | null;  // ルールスナップショットや値など
  createdAt: string;
  updatedAt: string;
  lastNotifiedAt: string | null;
}

/**
 * アラートイベント（監査ログ）
 */
export interface AlertEvent {
  id: string;
  alertId: string;
  action: AlertEventAction;
  actorUserId: string | null;  // null = system
  createdAt: string;
  note: string | null;
}

/**
 * アラート作成リクエスト
 */
export interface CreateAlertRequest {
  type: AlertType;
  sourceId?: string | null;
  title: string;
  message: string;
  severity: AlertSeverity;
  fingerprint: string;
  assignedRole?: string | null;
  assignedUserId?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * アラート一覧取得オプション
 */
export interface ListAlertsOptions {
  status?: AlertStatus;
  severity?: AlertSeverity;
  type?: AlertType;
  limit?: number;
  offset?: number;
}

/**
 * アラート統計
 */
export interface AlertStats {
  open: number;
  acknowledged: number;
  resolved: number;
  criticalOpen: number;
  byType: Record<AlertType, number>;
}

/**
 * アラート種別の表示名
 */
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  kpi_anomaly: 'KPI異常',
  approval_backlog: '承認滞留',
  deadline_overdue: '期限超過',
  system_error: 'システム',
  handover_urgent: '重要申し送り',
  ticket_backlog: 'チケット滞留',
  training_overdue: '研修期限超過',
  committee_risk: '委員会リスク',
  complaint_risk: 'クレームリスク',
  receivable_risk: '未収リスク',
  collection_flow_risk: '回収フロー超過',
};

/**
 * アラートステータスの表示名
 */
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  open: '未対応',
  acknowledged: '確認済',
  resolved: '解決済',
};

/**
 * アラート重要度の表示設定
 */
export const ALERT_SEVERITY_CONFIG: Record<
  AlertSeverity,
  { label: string; emoji: string; bg: string; text: string; border: string }
> = {
  critical: {
    label: '重大',
    emoji: '🔴',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  warning: {
    label: '警告',
    emoji: '⚠️',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  info: {
    label: '情報',
    emoji: 'ℹ️',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
};

/**
 * フィンガープリント生成ヘルパー
 */
export function generateFingerprint(
  type: AlertType,
  sourceId: string | null,
  additionalKey?: string
): string {
  const parts: string[] = [type];
  if (sourceId) parts.push(sourceId);
  if (additionalKey) parts.push(additionalKey);
  return parts.join(':');
}
