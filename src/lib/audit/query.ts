/**
 * 監査ビュー 横断ログ クエリ
 *
 * Implementation Ticket 064
 * - 各ソースを共通フィールドに変換して union
 * - occurredAt で desc ソート
 * - limit/offset 対応
 */

import type {
  AuditEntry,
  AuditLogFilter,
  AuditLogResult,
  AuditSource,
  AuditSeverity,
} from './types';
import { inferSeverity, maskPII } from './types';

// 各ソースからのインポート
import { getAiVpSettingsEvents, type AiVpSettingsEvent } from '@/lib/aiVp/settings';
import * as esignRepo from '@/lib/esign/repo';
import * as externalRepo from '@/lib/external-accounts/repo';
import * as ticketsRepo from '@/lib/tickets/repo';

// =========================================
// ソース別変換関数
// =========================================

/**
 * AI VP設定イベントを変換
 */
function convertAiVpEvents(limit: number = 100): AuditEntry[] {
  const events = getAiVpSettingsEvents(limit);
  return events.map((e: AiVpSettingsEvent): AuditEntry => ({
    id: `aivp_${e.id}`,
    source: 'ai_vp',
    action: e.action,
    severity: inferSeverity(e.action, 'ai_vp'),
    actorUserId: e.actorUserId,
    actorName: null,
    occurredAt: e.createdAt,
    targetType: 'ai_vp_config',
    targetId: null,
    summary: `AI副社長設定: ${getActionLabel(e.action)}${e.note ? ` - ${e.note}` : ''}`,
    metaJson: e.beforeJson ? { beforeJson: e.beforeJson, afterJson: e.afterJson } : null,
  }));
}

/**
 * 電子署名イベントを変換
 */
function convertESignEvents(): AuditEntry[] {
  // esignはrecordId毎にイベントを取得する必要があるが、
  // ここでは全レコードの最新イベントを取得
  const viewer = { userId: 'system', role: 'admin' as const };
  const { records } = esignRepo.listESignRecords(viewer, { limit: 200 });

  const entries: AuditEntry[] = [];
  for (const record of records) {
    const events = esignRepo.getESignEvents(record.id);
    for (const e of events.slice(0, 5)) { // 各レコードの最新5件
      entries.push({
        id: `esign_${e.id}`,
        source: 'esign',
        action: e.action,
        severity: inferSeverity(e.action, 'esign'),
        actorUserId: e.actorUserId,
        actorName: null,
        occurredAt: e.createdAt,
        targetType: 'esign_record',
        targetId: e.recordId,
        summary: `署名ログ: ${getESignActionLabel(e.action)} - ${maskPII(record.subjectName) ?? '不明'}`,
        metaJson: e.beforeJson || e.afterJson ? { beforeJson: e.beforeJson, afterJson: e.afterJson } : null,
      });
    }
  }
  return entries;
}

/**
 * 外部アカウントログを変換
 */
function convertExternalLogs(): AuditEntry[] {
  const viewer = { userId: 'system', role: 'admin' as const };
  const logs = externalRepo.getAuditLogs(viewer, { limit: 200 });

  return logs.map((log): AuditEntry => ({
    id: `ext_${log.id}`,
    source: 'external',
    action: log.action,
    severity: inferSeverity(log.action, 'external'),
    actorUserId: null, // 外部ユーザーのアクション
    actorName: null,
    occurredAt: log.timestamp,
    targetType: log.targetType as AuditEntry['targetType'] ?? 'external_user',
    targetId: log.targetId ?? log.externalUserId,
    summary: `外部アクセス: ${getExternalActionLabel(log.action)}${log.details ? ` - ${log.details}` : ''}`,
    metaJson: log.ipAddress || log.userAgent ? { ipAddress: log.ipAddress, userAgent: log.userAgent } : null,
  }));
}

/**
 * チケットイベントを変換
 */
function convertTicketEvents(): AuditEntry[] {
  const viewer = { userId: 'system', role: 'admin' as const };
  const { items: tickets } = ticketsRepo.listTickets({ limit: 100 }, viewer);

  const entries: AuditEntry[] = [];
  for (const ticket of tickets) {
    const events = ticketsRepo.listTicketEvents(ticket.id);
    for (const e of events.slice(0, 3)) { // 各チケットの最新3件
      entries.push({
        id: `ticket_${e.id}`,
        source: 'tickets',
        action: e.action,
        severity: inferSeverity(e.action, 'tickets'),
        actorUserId: e.actorUserId,
        actorName: e.actorUserName ?? null,
        occurredAt: e.createdAt,
        targetType: 'ticket',
        targetId: e.ticketId,
        summary: `チケット: ${getTicketActionLabel(e.action)} - ${ticket.title}`,
        metaJson: e.beforeJson || e.afterJson ? { beforeJson: e.beforeJson, afterJson: e.afterJson } : null,
      });
    }
  }
  return entries;
}

// =========================================
// メインクエリ関数
// =========================================

/**
 * 監査ログを横断検索
 */
export function queryAuditLog(filter: AuditLogFilter = {}): AuditLogResult {
  // 全ソースからエントリを収集
  let allEntries: AuditEntry[] = [];

  // ソースフィルタ
  const targetSources: AuditSource[] = filter.sources ?? (filter.source ? [filter.source] : [
    'ai_vp', 'esign', 'external', 'tickets'
  ]);

  // 各ソースからデータ取得
  if (targetSources.includes('ai_vp')) {
    allEntries = allEntries.concat(convertAiVpEvents());
  }
  if (targetSources.includes('esign')) {
    allEntries = allEntries.concat(convertESignEvents());
  }
  if (targetSources.includes('external')) {
    allEntries = allEntries.concat(convertExternalLogs());
  }
  if (targetSources.includes('tickets')) {
    allEntries = allEntries.concat(convertTicketEvents());
  }

  // 期間フィルタ
  if (filter.from) {
    const fromDate = new Date(filter.from);
    allEntries = allEntries.filter((e) => new Date(e.occurredAt) >= fromDate);
  }
  if (filter.to) {
    const toDate = new Date(filter.to);
    allEntries = allEntries.filter((e) => new Date(e.occurredAt) <= toDate);
  }

  // 重要度フィルタ
  if (filter.severity) {
    allEntries = allEntries.filter((e) => e.severity === filter.severity);
  }

  // アクターフィルタ
  if (filter.actorUserId) {
    allEntries = allEntries.filter((e) => e.actorUserId === filter.actorUserId);
  }

  // ターゲットフィルタ
  if (filter.targetType) {
    allEntries = allEntries.filter((e) => e.targetType === filter.targetType);
  }
  if (filter.targetId) {
    allEntries = allEntries.filter((e) => e.targetId === filter.targetId);
  }

  // テキスト検索
  if (filter.q) {
    const q = filter.q.toLowerCase();
    allEntries = allEntries.filter((e) =>
      e.summary.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q)
    );
  }

  // ソート（新しい順）
  allEntries.sort((a, b) =>
    new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  const total = allEntries.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  const items = allEntries.slice(offset, offset + limit);

  return { items, total };
}

/**
 * 今日の重要イベントを取得
 */
export function getTodayImportantEvents(): AuditEntry[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = queryAuditLog({
    from: today.toISOString(),
    severity: 'critical',
    limit: 20,
  });

  // criticalがなければwarningも含める
  if (result.items.length < 5) {
    const warnings = queryAuditLog({
      from: today.toISOString(),
      severity: 'warning',
      limit: 10,
    });
    return [...result.items, ...warnings.items].slice(0, 20);
  }

  return result.items;
}

/**
 * 外部アクセスログを取得
 */
export function getExternalAccessEvents(limit: number = 50): AuditEntry[] {
  const result = queryAuditLog({
    sources: ['external', 'shares'],
    limit,
  });
  return result.items;
}

/**
 * 契約・同意・署名の変更ログを取得
 */
export function getContractAgreementEvents(limit: number = 50): AuditEntry[] {
  const result = queryAuditLog({
    sources: ['agreements', 'esign', 'contracts'],
    limit,
  });
  return result.items;
}

/**
 * 設定・権限の重要変更ログを取得
 */
export function getSettingsChangeEvents(limit: number = 50): AuditEntry[] {
  const result = queryAuditLog({
    sources: ['ai_vp', 'backfill'],
    limit,
  });
  return result.items;
}

// =========================================
// CSV出力
// =========================================

/**
 * CSV形式で出力
 */
export function exportAuditLogToCsv(filter: AuditLogFilter = {}): string {
  // 全件取得（limit解除）
  const result = queryAuditLog({ ...filter, limit: 10000, offset: 0 });

  const headers = [
    '日時',
    'ソース',
    'アクション',
    '重要度',
    '操作者ID',
    '対象タイプ',
    '対象ID',
    'サマリー',
  ];

  const rows = result.items.map((e) => [
    e.occurredAt,
    e.source,
    e.action,
    e.severity,
    e.actorUserId ?? '',
    e.targetType ?? '',
    e.targetId ?? '',
    `"${e.summary.replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// =========================================
// ヘルパー関数
// =========================================

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    update: '設定更新',
    reset: 'リセット',
    rollback: 'ロールバック',
    apply_preset: 'プリセット適用',
  };
  return labels[action] ?? action;
}

function getESignActionLabel(action: string): string {
  const labels: Record<string, string> = {
    create: '作成',
    update: '更新',
    request: '署名依頼',
    sign: '署名完了',
    decline: '辞退',
    void: '無効化',
    expire: '期限切れ',
  };
  return labels[action] ?? action;
}

function getExternalActionLabel(action: string): string {
  const labels: Record<string, string> = {
    login: 'ログイン',
    logout: 'ログアウト',
    view: '閲覧',
    download: 'ダウンロード',
    access: 'アクセス',
    invited: '招待',
    activated: '有効化',
    disabled: '無効化',
    expired: '期限切れ',
    policy_updated: 'ポリシー更新',
  };
  return labels[action] ?? action;
}

function getTicketActionLabel(action: string): string {
  const labels: Record<string, string> = {
    create: '作成',
    update: '更新',
    assign: '担当割当',
    unassign: '担当解除',
    status_change: 'ステータス変更',
    priority_change: '優先度変更',
    category_change: 'カテゴリ変更',
    comment: 'コメント',
    resolve: '解決',
    close: 'クローズ',
    reopen: '再オープン',
  };
  return labels[action] ?? action;
}
