/**
 * アラートリポジトリ
 *
 * アラートの永続化とCRUD操作
 * インメモリストレージ（本番ではDBに置き換え）
 */

import type {
  Alert,
  AlertEvent,
  AlertStats,
  AlertStatus,
  AlertSeverity,
  AlertType,
  CreateAlertRequest,
  ListAlertsOptions,
  AlertEventAction,
} from './types';

// インメモリストレージ
const alertsStore = new Map<string, Alert>();
const eventsStore = new Map<string, AlertEvent[]>();

// ID生成
let alertIdCounter = 1;
let eventIdCounter = 1;

function generateAlertId(): string {
  return `alert_${Date.now()}_${alertIdCounter++}`;
}

function generateEventId(): string {
  return `event_${Date.now()}_${eventIdCounter++}`;
}

// 重複抑制の再通知間隔（2時間）
const RENOTIFY_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * アラート一覧を取得
 */
export function listAlerts(options: ListAlertsOptions = {}): {
  alerts: Alert[];
  total: number;
} {
  let alerts = Array.from(alertsStore.values());

  // フィルタリング
  if (options.status) {
    alerts = alerts.filter((a) => a.status === options.status);
  }
  if (options.severity) {
    alerts = alerts.filter((a) => a.severity === options.severity);
  }
  if (options.type) {
    alerts = alerts.filter((a) => a.type === options.type);
  }

  // ソート（critical優先、新しい順）
  alerts.sort((a, b) => {
    // severity優先度
    const severityOrder: Record<AlertSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // 日付順
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const total = alerts.length;

  // ページネーション
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  alerts = alerts.slice(offset, offset + limit);

  return { alerts, total };
}

/**
 * IDでアラートを取得
 */
export function getAlertById(id: string): Alert | null {
  return alertsStore.get(id) ?? null;
}

/**
 * フィンガープリントでオープンアラートを検索
 */
export function findOpenByFingerprint(fingerprint: string): Alert | null {
  for (const alert of alertsStore.values()) {
    if (alert.fingerprint === fingerprint && alert.status === 'open') {
      return alert;
    }
  }
  return null;
}

/**
 * アラートを作成（重複抑制付き）
 */
export function createAlert(
  request: CreateAlertRequest
): { alert: Alert; isNew: boolean } {
  // 重複チェック
  const existing = findOpenByFingerprint(request.fingerprint);
  if (existing) {
    return { alert: existing, isNew: false };
  }

  const now = new Date().toISOString();
  const alert: Alert = {
    id: generateAlertId(),
    type: request.type,
    sourceId: request.sourceId ?? null,
    title: request.title,
    message: request.message,
    severity: request.severity,
    status: 'open',
    fingerprint: request.fingerprint,
    assignedRole: request.assignedRole ?? null,
    assignedUserId: request.assignedUserId ?? null,
    meta: request.meta ?? null,
    createdAt: now,
    updatedAt: now,
    lastNotifiedAt: null,
  };

  alertsStore.set(alert.id, alert);

  // イベントログ
  addEvent(alert.id, 'create', null, null);

  return { alert, isNew: true };
}

/**
 * アラートステータスを更新
 */
export function updateAlertStatus(
  id: string,
  status: AlertStatus,
  actorUserId?: string | null
): Alert | null {
  const alert = alertsStore.get(id);
  if (!alert) return null;

  alert.status = status;
  alert.updatedAt = new Date().toISOString();
  alertsStore.set(id, alert);

  // イベントログ
  const action: AlertEventAction = status === 'acknowledged' ? 'ack' : 'resolve';
  addEvent(id, action, actorUserId ?? null, null);

  return alert;
}

/**
 * 最終通知日時を更新
 */
export function updateLastNotifiedAt(id: string, timestamp: Date): Alert | null {
  const alert = alertsStore.get(id);
  if (!alert) return null;

  alert.lastNotifiedAt = timestamp.toISOString();
  alert.updatedAt = new Date().toISOString();
  alertsStore.set(id, alert);

  // イベントログ
  addEvent(id, 'notify', null, null);

  return alert;
}

/**
 * 再通知可能かチェック
 */
export function canRenotify(alert: Alert): boolean {
  if (!alert.lastNotifiedAt) return true;

  const lastNotified = new Date(alert.lastNotifiedAt).getTime();
  const now = Date.now();

  return now - lastNotified >= RENOTIFY_INTERVAL_MS;
}

/**
 * アラート統計を取得
 */
export function getAlertStats(): AlertStats {
  const alerts = Array.from(alertsStore.values());

  const stats: AlertStats = {
    open: 0,
    acknowledged: 0,
    resolved: 0,
    criticalOpen: 0,
    byType: {
      kpi_anomaly: 0,
      approval_backlog: 0,
      deadline_overdue: 0,
      system_error: 0,
      handover_urgent: 0,
      ticket_backlog: 0,
      training_overdue: 0,
      committee_risk: 0,
      complaint_risk: 0,
      receivable_risk: 0,
      collection_flow_risk: 0,
      agreement_risk: 0,
      // Task 038: 未分類スコープ（正式名称 + レガシー）
      business_scope_unclassified: 0,
      unclassified_scope: 0,
      // Task 058: 未割当アイテム
      unassigned_item: 0,
      // Ticket 130: MBR改善タスク期限超過
      mbr_action_overdue: 0,
    },
  };

  for (const alert of alerts) {
    // ステータス別
    if (alert.status === 'open') stats.open++;
    else if (alert.status === 'acknowledged') stats.acknowledged++;
    else if (alert.status === 'resolved') stats.resolved++;

    // critical open
    if (alert.status === 'open' && alert.severity === 'critical') {
      stats.criticalOpen++;
    }

    // タイプ別（openのみ）
    if (alert.status === 'open') {
      stats.byType[alert.type]++;
    }
  }

  return stats;
}

/**
 * イベントを追加（内部）
 */
function addEvent(
  alertId: string,
  action: AlertEventAction,
  actorUserId: string | null,
  note: string | null
): void {
  const event: AlertEvent = {
    id: generateEventId(),
    alertId,
    action,
    actorUserId,
    createdAt: new Date().toISOString(),
    note,
  };

  const events = eventsStore.get(alertId) ?? [];
  events.push(event);
  eventsStore.set(alertId, events);
}

/**
 * アラートのイベント履歴を取得
 */
export function getAlertEvents(alertId: string): AlertEvent[] {
  return eventsStore.get(alertId) ?? [];
}

/**
 * 一括アラート作成（スキャン結果用）
 */
export function createAlertsFromScan(
  requests: CreateAlertRequest[]
): { created: number; skipped: number } {
  let created = 0;
  let skipped = 0;

  for (const request of requests) {
    const result = createAlert(request);
    if (result.isNew) {
      created++;
    } else {
      skipped++;
    }
  }

  return { created, skipped };
}

/**
 * アラートをクリア（テスト用）
 */
export function clearAllAlerts(): void {
  alertsStore.clear();
  eventsStore.clear();
  alertIdCounter = 1;
  eventIdCounter = 1;
}

/**
 * WBR用：今週のアラートサマリーを取得
 */
export function getWeeklyAlertSummary(): {
  newAlerts: number;
  criticalOpen: number;
  topCriticals: { title: string; type: AlertType }[];
} {
  const alerts = Array.from(alertsStore.values());

  // 今週の開始日（月曜日）
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  // 今週作成されたアラート
  const weeklyAlerts = alerts.filter(
    (a) => new Date(a.createdAt) >= weekStart
  );

  // critical openのアラート
  const criticalOpenAlerts = alerts.filter(
    (a) => a.status === 'open' && a.severity === 'critical'
  );

  return {
    newAlerts: weeklyAlerts.length,
    criticalOpen: criticalOpenAlerts.length,
    topCriticals: criticalOpenAlerts.slice(0, 3).map((a) => ({
      title: a.title,
      type: a.type,
    })),
  };
}
