/**
 * 監査ログ統合クエリ
 *
 * Ticket 064-final: 横断監査ビュー
 *
 * 各ソースを共通形式に変換して配列結合→sort→paginate
 */

import type {
  AuditEntry,
  AuditQueryFilter,
  AuditQueryResult,
  AuditSource,
  AuditSeverity,
} from './types';
import { normalizeDate, maskPII } from './types';

// ソースからのインポート
import { listAllActions } from '@/lib/approvals/requestRepo';
import type { ApprovalAction } from '@/lib/approvals/types';
import { getEventsAll } from '@/lib/agreements/repo';
import type { AgreementEvent } from '@/lib/agreements/types';
import { getAccessLogs } from '@/lib/shares/share-service';
import type { ShareAccessLog } from '@/lib/shares/types';
import { getAuditLogs as getExternalAuditLogs } from '@/lib/external-accounts/repo';
import type { ExternalAuditLog } from '@/lib/external-accounts/types';
import { getAiVpSettingsEvents } from '@/lib/aiVp/settings';
import type { AiVpSettingsEvent } from '@/lib/aiVp/settings';
import { listBackfillEvents } from '@/lib/admin/backfill/repo';
import type { ScopeBackfillEvent } from '@/lib/admin/backfill/types';
import { listRecentRuns as listDailyOpsRuns } from '@/lib/dailyOps/repo';
import type { DailyOpsRun } from '@/lib/dailyOps/types';
import { listRecentRuns as listWeeklyOpsRuns } from '@/lib/weeklyOps/repo';
import type { WeeklyOpsRun } from '@/lib/weeklyOps/types';
import { getUserById } from '@/lib/roles/user-store';

// ========== ソース変換関数 ==========

/**
 * 承認アクションを変換
 */
function convertApprovalActions(actions: ApprovalAction[]): AuditEntry[] {
  return actions.map((a) => ({
    id: `approval_${a.id}`,
    occurredAt: a.createdAt,
    source: 'approval_actions' as AuditSource,
    action: a.action,
    severity: determineSeverity(a.action, 'approval'),
    actorUserId: a.actorUserId,
    actorName: a.actorUserName ?? null,
    targetType: 'approval_request',
    targetId: a.requestId,
    summary: buildApprovalSummary(a),
    metaJson: JSON.stringify({ stepOrder: a.stepOrder, note: a.note }),
  }));
}

/**
 * 同意書イベントを変換
 */
function convertAgreementEvents(events: AgreementEvent[]): AuditEntry[] {
  return events.map((e) => {
    const actorUser = e.actorUserId ? getUserById(e.actorUserId) : null;
    return {
      id: `agreement_${e.id}`,
      occurredAt: e.createdAt,
      source: 'agreement_events' as AuditSource,
      action: e.action,
      severity: determineSeverity(e.action, 'agreement'),
      actorUserId: e.actorUserId,
      actorName: actorUser?.name ?? null,
      targetType: e.entityType,
      targetId: e.entityId,
      summary: buildAgreementSummary(e),
      metaJson: JSON.stringify({ beforeJson: e.beforeJson, afterJson: e.afterJson, note: e.note }),
    };
  });
}

/**
 * 共有アクセスログを変換
 */
function convertSharesAccessLogs(logs: ShareAccessLog[]): AuditEntry[] {
  return logs.map((l) => ({
    id: `share_${l.id}`,
    occurredAt: l.accessedAt,
    source: 'shares_access' as AuditSource,
    action: 'access',
    severity: 'info' as AuditSeverity,
    actorUserId: null,
    actorName: null,
    targetType: 'share',
    targetId: l.shareId,
    summary: `外部共有にアクセス (IP: ${maskPII(l.ipAddress ?? 'unknown')})`,
    metaJson: JSON.stringify({ ipAddress: l.ipAddress, userAgent: l.userAgent, country: l.country }),
  }));
}

/**
 * 外部監査ログを変換
 */
function convertExternalAuditLogs(logs: ExternalAuditLog[]): AuditEntry[] {
  return logs.map((l) => ({
    id: `external_${l.id}`,
    occurredAt: l.timestamp,
    source: 'external_audit' as AuditSource,
    action: l.action,
    severity: determineSeverity(l.action, 'external'),
    actorUserId: null,
    actorName: null, // 外部ユーザーなので内部actorなし
    targetType: l.targetType,
    targetId: l.targetId,
    summary: buildExternalSummary(l),
    metaJson: JSON.stringify({ externalUserId: l.externalUserId, details: l.details, ipAddress: l.ipAddress }),
  }));
}

/**
 * AI VP設定イベントを変換
 */
function convertAiVpSettingsEvents(events: AiVpSettingsEvent[]): AuditEntry[] {
  return events.map((e) => {
    const actorUser = getUserById(e.actorUserId);
    return {
      id: `aivp_${e.id}`,
      occurredAt: e.createdAt,
      source: 'ai_vp_settings' as AuditSource,
      action: e.action,
      severity: determineSeverity(e.action, 'aivp'),
      actorUserId: e.actorUserId,
      actorName: actorUser?.name ?? null,
      targetType: 'ai_vp_config',
      targetId: null,
      summary: `AI VP設定: ${e.action}${e.note ? ` - ${e.note}` : ''}`,
      metaJson: JSON.stringify({ beforeJson: e.beforeJson, afterJson: e.afterJson }),
    };
  });
}

/**
 * スコープ一括イベントを変換
 */
function convertBackfillEvents(events: ScopeBackfillEvent[]): AuditEntry[] {
  return events.map((e) => ({
    id: `backfill_${e.id}`,
    occurredAt: e.createdAt,
    source: 'scope_backfill' as AuditSource,
    action: e.dryRun ? 'preview' : 'apply',
    severity: e.dryRun ? 'info' as AuditSeverity : 'warning' as AuditSeverity,
    actorUserId: e.actorUserId,
    actorName: e.actorUserName,
    targetType: e.entityType,
    targetId: e.targetBusinessUnitId,
    summary: `${e.entityType} ${e.affectedCount}件を ${e.targetBusinessUnitName ?? e.targetBusinessUnitId} に${e.dryRun ? '(プレビュー)' : '一括付与'}`,
    metaJson: e.filterJson,
  }));
}

/**
 * 日次オペ実行を変換
 */
function convertDailyOpsRuns(runs: DailyOpsRun[]): AuditEntry[] {
  return runs.map((r) => ({
    id: `daily_${r.id}`,
    occurredAt: r.startedAt,
    source: 'daily_ops' as AuditSource,
    action: r.ok ? 'success' : 'failure',
    severity: r.ok ? 'info' as AuditSeverity : 'critical' as AuditSeverity,
    actorUserId: null,
    actorName: 'システム',
    targetType: 'daily_ops',
    targetId: r.date,
    summary: `日次オペ ${r.date}: ${r.ok ? '成功' : '失敗'} (アラート${r.totalAlertsCreated}件)`,
    metaJson: JSON.stringify({
      date: r.date,
      ok: r.ok,
      totalAlertsCreated: r.totalAlertsCreated,
      totalAlertsSkipped: r.totalAlertsSkipped,
      totalNotifications: r.totalNotifications,
      failedSteps: r.failedSteps,
      errorMessage: r.errorMessage,
    }),
  }));
}

/**
 * 週次オペ実行を変換
 */
function convertWeeklyOpsRuns(runs: WeeklyOpsRun[]): AuditEntry[] {
  return runs.map((r) => ({
    id: `weekly_${r.id}`,
    occurredAt: r.startedAt,
    source: 'weekly_ops' as AuditSource,
    action: r.ok ? 'success' : 'failure',
    severity: r.ok ? 'info' as AuditSeverity : 'critical' as AuditSeverity,
    actorUserId: null,
    actorName: 'システム',
    targetType: 'weekly_ops',
    targetId: r.weekStart,
    summary: `週次オペ ${r.weekStart}: ${r.ok ? '成功' : '失敗'} (処理${r.totalItemsProcessed}件)`,
    metaJson: JSON.stringify({
      weekStart: r.weekStart,
      ok: r.ok,
      totalItemsProcessed: r.totalItemsProcessed,
      totalAlertsCreated: r.totalAlertsCreated,
      failedSteps: r.failedSteps,
      errorMessage: r.errorMessage,
    }),
  }));
}

// ========== ヘルパー関数 ==========

/**
 * アクションに基づいて重要度を判定
 */
function determineSeverity(action: string, sourceType: string): AuditSeverity {
  // 重大
  const criticalActions = ['reject', 'cancel', 'access_denied', 'disabled', 'failure', 'withdraw'];
  if (criticalActions.includes(action)) return 'critical';

  // 警告
  const warningActions = ['return', 'expired', 'apply', 'rollback', 'reset'];
  if (warningActions.includes(action)) return 'warning';

  // 情報（デフォルト）
  return 'info';
}

/**
 * 承認サマリー生成
 */
function buildApprovalSummary(action: ApprovalAction): string {
  const actionLabels: Record<string, string> = {
    submit: '申請提出',
    approve: '承認',
    reject: '却下',
    return: '差戻',
    cancel: 'キャンセル',
    comment: 'コメント',
  };
  const label = actionLabels[action.action] ?? action.action;
  return `${label}${action.note ? `: ${action.note.substring(0, 50)}` : ''}`;
}

/**
 * 同意書サマリー生成
 */
function buildAgreementSummary(event: AgreementEvent): string {
  const actionLabels: Record<string, string> = {
    create: '作成',
    update: '更新',
    activate_document: '有効化',
    archive_document: 'アーカイブ',
    record_consent: '同意記録',
    withdraw: '撤回',
    renew: '更新',
  };
  const label = actionLabels[event.action] ?? event.action;
  return `${event.entityType} ${label}${event.note ? `: ${event.note.substring(0, 50)}` : ''}`;
}

/**
 * 外部監査サマリー生成
 */
function buildExternalSummary(log: ExternalAuditLog): string {
  const actionLabels: Record<string, string> = {
    login: 'ログイン',
    logout: 'ログアウト',
    view: '閲覧',
    download: 'ダウンロード',
    access_denied: 'アクセス拒否',
    invited: '招待',
    activated: '有効化',
    disabled: '無効化',
    policy_updated: 'ポリシー更新',
    expired: '期限切れ',
  };
  const label = actionLabels[log.action] ?? log.action;
  const target = log.targetType ? ` (${log.targetType})` : '';
  return `外部ユーザー: ${label}${target}`;
}

// ========== メインクエリ関数 ==========

/**
 * 監査ログを横断検索
 */
export function queryAuditLogs(filter: AuditQueryFilter): AuditQueryResult {
  const limit = filter.limit ?? 100;
  const offset = filter.offset ?? 0;

  // 各ソースから取得
  let allEntries: AuditEntry[] = [];

  const requestedSources = filter.source
    ? Array.isArray(filter.source) ? filter.source : [filter.source]
    : null;

  // approval_actions
  if (!requestedSources || requestedSources.includes('approval_actions')) {
    const actions = listAllActions(1000);
    allEntries = allEntries.concat(convertApprovalActions(actions));
  }

  // agreement_events
  if (!requestedSources || requestedSources.includes('agreement_events')) {
    const events = getEventsAll();
    allEntries = allEntries.concat(convertAgreementEvents(events));
  }

  // shares_access
  if (!requestedSources || requestedSources.includes('shares_access')) {
    const logs = getAccessLogs();
    allEntries = allEntries.concat(convertSharesAccessLogs(logs));
  }

  // external_audit
  if (!requestedSources || requestedSources.includes('external_audit')) {
    // ViewerContextが必要だが、audit viewは admin/auditor のみなので強制取得
    const logs = getExternalAuditLogs({ userId: 'system', role: 'admin' }, {});
    allEntries = allEntries.concat(convertExternalAuditLogs(logs));
  }

  // ai_vp_settings
  if (!requestedSources || requestedSources.includes('ai_vp_settings')) {
    const events = getAiVpSettingsEvents(1000);
    allEntries = allEntries.concat(convertAiVpSettingsEvents(events));
  }

  // scope_backfill
  if (!requestedSources || requestedSources.includes('scope_backfill')) {
    const events = listBackfillEvents(1000);
    allEntries = allEntries.concat(convertBackfillEvents(events));
  }

  // daily_ops
  if (!requestedSources || requestedSources.includes('daily_ops')) {
    const runs = listDailyOpsRuns(100);
    allEntries = allEntries.concat(convertDailyOpsRuns(runs));
  }

  // weekly_ops
  if (!requestedSources || requestedSources.includes('weekly_ops')) {
    const runs = listWeeklyOpsRuns(100);
    allEntries = allEntries.concat(convertWeeklyOpsRuns(runs));
  }

  // フィルタ適用
  let filtered = allEntries;

  // 日付範囲
  if (filter.from) {
    const fromDate = normalizeDate(filter.from, false);
    filtered = filtered.filter((e) => e.occurredAt >= fromDate);
  }
  if (filter.to) {
    const toDate = normalizeDate(filter.to, true);
    filtered = filtered.filter((e) => e.occurredAt <= toDate);
  }

  // 重要度
  if (filter.severity) {
    const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
    filtered = filtered.filter((e) => severities.includes(e.severity));
  }

  // actorUserId
  if (filter.actorUserId) {
    filtered = filtered.filter((e) => e.actorUserId === filter.actorUserId);
  }

  // targetType
  if (filter.targetType) {
    filtered = filtered.filter((e) => e.targetType === filter.targetType);
  }

  // targetId
  if (filter.targetId) {
    filtered = filtered.filter((e) => e.targetId === filter.targetId);
  }

  // テキスト検索
  if (filter.q) {
    const q = filter.q.toLowerCase();
    filtered = filtered.filter((e) =>
      e.summary.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q) ||
      (e.actorName?.toLowerCase().includes(q) ?? false)
    );
  }

  // ソート（新しい順）
  filtered.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const total = filtered.length;

  // ページネーション
  const items = filtered.slice(offset, offset + limit);

  return { items, total };
}

/**
 * CSV出力用のデータ生成
 */
export function exportAuditLogsToCsv(filter: AuditQueryFilter): string {
  // 全件取得（ページネーションなし）
  const result = queryAuditLogs({ ...filter, limit: 100000, offset: 0 });

  const headers = [
    '発生日時',
    'ソース',
    'アクション',
    '重要度',
    'アクターID',
    'アクター名',
    '対象種別',
    '対象ID',
    'サマリー',
  ];

  const rows = result.items.map((e) => [
    e.occurredAt,
    e.source,
    e.action,
    e.severity,
    e.actorUserId ?? '',
    e.actorName ?? '',
    e.targetType ?? '',
    e.targetId ?? '',
    `"${e.summary.replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
