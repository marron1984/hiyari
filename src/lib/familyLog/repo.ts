/**
 * 家族連絡ログ リポジトリ
 *
 * CRUD操作と監査ログ
 * インメモリストレージ（本番ではDBに置き換え）
 */

import type {
  FamilyContactLog,
  FamilyContactLogEvent,
  FamilyLogStats,
  FamilyLogCategory,
  CreateFamilyLogRequest,
  UpdateFamilyLogRequest,
  ListFamilyLogsOptions,
  ViewerContext,
} from './types';
import { canManageFamilyLogs } from './types';

// インメモリストレージ
const logsStore = new Map<string, FamilyContactLog>();
const eventsStore = new Map<string, FamilyContactLogEvent[]>();

// ID生成
let logIdCounter = 1;
let eventIdCounter = 1;

function generateLogId(): string {
  return `famlog_${Date.now()}_${logIdCounter++}`;
}

function generateEventId(): string {
  return `famlog_evt_${Date.now()}_${eventIdCounter++}`;
}

// 今週の開始日（月曜日）を取得
function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

/**
 * イベントを記録（内部）
 */
function addEvent(
  logId: string,
  actorUserId: string,
  action: 'create' | 'update',
  beforeJson: Record<string, unknown> | null,
  afterJson: Record<string, unknown> | null
): void {
  const event: FamilyContactLogEvent = {
    id: generateEventId(),
    logId,
    actorUserId,
    action,
    beforeJson,
    afterJson,
    createdAt: new Date().toISOString(),
  };
  const events = eventsStore.get(logId) ?? [];
  events.push(event);
  eventsStore.set(logId, events);
}

/**
 * 連絡ログ一覧を取得
 */
export function listFamilyLogs(
  viewer: ViewerContext,
  options: ListFamilyLogsOptions = {}
): { logs: FamilyContactLog[]; total: number } {
  let logs = Array.from(logsStore.values());

  // RBAC: staff/leaderは自分が記録したログのみ
  if (!canManageFamilyLogs(viewer.role)) {
    logs = logs.filter((log) => log.recordedByUserId === viewer.userId);
  }

  // フィルタリング
  if (options.subjectId) {
    logs = logs.filter((l) => l.subjectId === options.subjectId);
  }
  if (options.subjectType) {
    logs = logs.filter((l) => l.subjectType === options.subjectType);
  }
  if (options.importance) {
    logs = logs.filter((l) => l.importance === options.importance);
  }
  if (options.category) {
    logs = logs.filter((l) => l.category === options.category);
  }
  if (options.contactType) {
    logs = logs.filter((l) => l.contactType === options.contactType);
  }
  if (options.recordedByUserId) {
    logs = logs.filter((l) => l.recordedByUserId === options.recordedByUserId);
  }
  if (options.dateFrom) {
    const from = new Date(options.dateFrom);
    logs = logs.filter((l) => new Date(l.occurredAt) >= from);
  }
  if (options.dateTo) {
    const to = new Date(options.dateTo);
    logs = logs.filter((l) => new Date(l.occurredAt) <= to);
  }
  if (options.q) {
    const q = options.q.toLowerCase();
    logs = logs.filter(
      (l) =>
        l.summary.toLowerCase().includes(q) ||
        (l.detail && l.detail.toLowerCase().includes(q))
    );
  }

  // ソート（新しい順）
  logs.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  const total = logs.length;

  // ページネーション
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  logs = logs.slice(offset, offset + limit);

  return { logs, total };
}

/**
 * IDで連絡ログを取得
 */
export function getFamilyLogById(
  id: string,
  viewer: ViewerContext
): FamilyContactLog | null {
  const log = logsStore.get(id);
  if (!log) return null;

  // RBAC
  if (!canManageFamilyLogs(viewer.role)) {
    if (log.recordedByUserId !== viewer.userId) {
      return null;
    }
  }

  return log;
}

/**
 * 連絡ログを作成
 */
export function createFamilyLog(
  request: CreateFamilyLogRequest,
  actorUserId: string
): FamilyContactLog {
  const now = new Date().toISOString();
  const log: FamilyContactLog = {
    id: generateLogId(),
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    contactType: request.contactType,
    direction: request.direction,
    category: request.category,
    importance: request.importance,
    counterpartName: request.counterpartName ?? null,
    counterpartRelation: request.counterpartRelation ?? null,
    summary: request.summary,
    detail: request.detail ?? null,
    occurredAt: request.occurredAt,
    recordedByUserId: actorUserId,
    relatedType: request.relatedType ?? null,
    relatedId: request.relatedId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  logsStore.set(log.id, log);
  addEvent(log.id, actorUserId, 'create', null, log as unknown as Record<string, unknown>);

  return log;
}

/**
 * 連絡ログを更新
 */
export function updateFamilyLog(
  id: string,
  patch: UpdateFamilyLogRequest,
  actorUserId: string
): FamilyContactLog | null {
  const log = logsStore.get(id);
  if (!log) return null;

  const before = { ...log };

  if (patch.contactType !== undefined) log.contactType = patch.contactType;
  if (patch.direction !== undefined) log.direction = patch.direction;
  if (patch.category !== undefined) log.category = patch.category;
  if (patch.importance !== undefined) log.importance = patch.importance;
  if (patch.counterpartName !== undefined) log.counterpartName = patch.counterpartName;
  if (patch.counterpartRelation !== undefined) log.counterpartRelation = patch.counterpartRelation;
  if (patch.summary !== undefined) log.summary = patch.summary;
  if (patch.detail !== undefined) log.detail = patch.detail;
  if (patch.occurredAt !== undefined) log.occurredAt = patch.occurredAt;
  if (patch.relatedType !== undefined) log.relatedType = patch.relatedType;
  if (patch.relatedId !== undefined) log.relatedId = patch.relatedId;

  log.updatedAt = new Date().toISOString();
  logsStore.set(id, log);

  addEvent(
    id,
    actorUserId,
    'update',
    before as unknown as Record<string, unknown>,
    log as unknown as Record<string, unknown>
  );

  return log;
}

/**
 * ログのイベント履歴を取得
 */
export function getFamilyLogEvents(logId: string): FamilyContactLogEvent[] {
  return eventsStore.get(logId) ?? [];
}

/**
 * 統計を取得（manager以上）
 */
export function getFamilyLogStats(): FamilyLogStats {
  const logs = Array.from(logsStore.values());
  const weekStart = getWeekStart();

  const stats: FamilyLogStats = {
    total: logs.length,
    criticalCount: 0,
    highCount: 0,
    thisWeekCount: 0,
    byCategory: {
      routine: 0,
      medical: 0,
      safety: 0,
      billing: 0,
      complaint: 0,
      other: 0,
    },
  };

  for (const log of logs) {
    if (log.importance === 'critical') stats.criticalCount++;
    if (log.importance === 'high') stats.highCount++;
    if (new Date(log.occurredAt) >= weekStart) stats.thisWeekCount++;
    stats.byCategory[log.category]++;
  }

  return stats;
}

/**
 * 重要ログをスキャン（通知用）
 */
export function scanCriticalLogs(): FamilyContactLog[] {
  const logs = Array.from(logsStore.values());
  return logs.filter((l) => l.importance === 'critical');
}

/**
 * 今週の重要ログ件数を取得
 */
export function getWeeklyCriticalCount(): number {
  const logs = Array.from(logsStore.values());
  const weekStart = getWeekStart();
  return logs.filter(
    (l) =>
      l.importance === 'critical' && new Date(l.occurredAt) >= weekStart
  ).length;
}

// ===== デモデータ =====
function initDemoData() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const demoLogs: Omit<FamilyContactLog, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      subjectType: 'client',
      subjectId: 'client_001',
      contactType: 'phone',
      direction: 'outbound',
      category: 'routine',
      importance: 'normal',
      counterpartName: '山田様（長女）',
      counterpartRelation: '長女',
      summary: '週次の状況報告',
      detail: '体調良好、食事もしっかり摂れている旨をお伝えしました。来週の面会予定を確認。',
      occurredAt: yesterday.toISOString(),
      recordedByUserId: 'user_staff_1',
      relatedType: null,
      relatedId: null,
    },
    {
      subjectType: 'client',
      subjectId: 'client_002',
      contactType: 'phone',
      direction: 'inbound',
      category: 'medical',
      importance: 'high',
      counterpartName: '鈴木様（妻）',
      counterpartRelation: '妻',
      summary: '体調不良に関する問い合わせ',
      detail: '昨日から少し熱があると聞いたとのこと。現在は37.2度で経過観察中であることを説明。明日も続くようなら受診予定。',
      occurredAt: twoDaysAgo.toISOString(),
      recordedByUserId: 'user_manager',
      relatedType: null,
      relatedId: null,
    },
    {
      subjectType: 'client',
      subjectId: 'client_003',
      contactType: 'in_person',
      direction: 'inbound',
      category: 'complaint',
      importance: 'critical',
      counterpartName: '佐藤様（長男）',
      counterpartRelation: '長男',
      summary: '【緊急】サービス内容に関するご意見',
      detail: '入浴介助の頻度について強いご不満の表明。週2回から週3回への変更を希望。ケアマネージャーと調整の上、本日中に回答予定。',
      occurredAt: now.toISOString(),
      recordedByUserId: 'user_manager',
      relatedType: 'complaint',
      relatedId: 'complaint_001',
    },
    {
      subjectType: 'client',
      subjectId: 'client_001',
      contactType: 'email',
      direction: 'outbound',
      category: 'billing',
      importance: 'normal',
      counterpartName: '山田様（長女）',
      counterpartRelation: '長女',
      summary: '来月分の請求書送付',
      detail: '2月分の請求書をメールにて送付。質問があればご連絡くださいと添えた。',
      occurredAt: lastWeek.toISOString(),
      recordedByUserId: 'user_staff_2',
      relatedType: null,
      relatedId: null,
    },
    {
      subjectType: 'client',
      subjectId: 'client_004',
      contactType: 'phone',
      direction: 'outbound',
      category: 'safety',
      importance: 'high',
      counterpartName: '田中様（長男）',
      counterpartRelation: '長男',
      summary: '転倒インシデントのご報告',
      detail: '本日午前中に居室内で転倒。外傷なし、バイタル異常なし。経過観察中。ご家族に状況を説明し、ご理解いただいた。',
      occurredAt: yesterday.toISOString(),
      recordedByUserId: 'user_manager',
      relatedType: 'incident',
      relatedId: 'incident_001',
    },
  ];

  for (const data of demoLogs) {
    const now = new Date().toISOString();
    const log: FamilyContactLog = {
      id: generateLogId(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    logsStore.set(log.id, log);
    addEvent(log.id, data.recordedByUserId, 'create', null, log as unknown as Record<string, unknown>);
  }
}

// 初期化
initDemoData();
