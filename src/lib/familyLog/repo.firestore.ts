/**
 * 家族連絡ログ Firestoreリポジトリ
 *
 * コレクション: family_contact_logs
 * サブコレクション: family_contact_logs/{logId}/events
 */

import { getAdminDb } from '@/lib/firebase-admin';
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

const COLLECTION = 'family_contact_logs';
const EVENTS_SUBCOLLECTION = 'events';

function now(): string {
  return new Date().toISOString();
}

// 今週の開始日（月曜日）を取得
function getWeekStart(): Date {
  const d = new Date();
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function docToFamilyContactLog(doc: FirebaseFirestore.DocumentSnapshot): FamilyContactLog {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    subjectType: d.subjectType,
    subjectId: d.subjectId,
    contactType: d.contactType,
    direction: d.direction,
    category: d.category,
    importance: d.importance,
    counterpartName: d.counterpartName ?? null,
    counterpartRelation: d.counterpartRelation ?? null,
    summary: d.summary,
    detail: d.detail ?? null,
    occurredAt: d.occurredAt,
    recordedByUserId: d.recordedByUserId,
    relatedType: d.relatedType ?? null,
    relatedId: d.relatedId ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): FamilyContactLogEvent {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    logId: d.logId,
    actorUserId: d.actorUserId,
    action: d.action,
    beforeJson: d.beforeJson ?? null,
    afterJson: d.afterJson ?? null,
    createdAt: d.createdAt,
  };
}

/**
 * イベントを記録（内部）
 */
async function addEvent(
  logId: string,
  actorUserId: string,
  action: 'create' | 'update',
  beforeJson: Record<string, unknown> | null,
  afterJson: Record<string, unknown> | null
): Promise<void> {
  const db = getAdminDb();
  const eventRef = db
    .collection(COLLECTION)
    .doc(logId)
    .collection(EVENTS_SUBCOLLECTION)
    .doc();

  const event: FamilyContactLogEvent = {
    id: eventRef.id,
    logId,
    actorUserId,
    action,
    beforeJson,
    afterJson,
    createdAt: now(),
  };

  await eventRef.set(event);
}

/**
 * 連絡ログ一覧を取得
 */
export async function listFamilyLogs(
  viewer: ViewerContext,
  options: ListFamilyLogsOptions = {}
): Promise<{ logs: FamilyContactLog[]; total: number }> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(COLLECTION);

  // RBAC: staff/leaderは自分が記録したログのみ（Firestoreクエリで絞る）
  if (!canManageFamilyLogs(viewer.role)) {
    q = q.where('recordedByUserId', '==', viewer.userId);
  }

  // Firestoreで直接フィルタ可能なもの
  if (options.subjectId) {
    q = q.where('subjectId', '==', options.subjectId);
  }
  if (options.importance) {
    q = q.where('importance', '==', options.importance);
  }
  if (options.category) {
    q = q.where('category', '==', options.category);
  }
  if (options.contactType) {
    q = q.where('contactType', '==', options.contactType);
  }
  if (options.recordedByUserId) {
    q = q.where('recordedByUserId', '==', options.recordedByUserId);
  }

  const snap = await q.get();
  let logs = snap.docs.map(docToFamilyContactLog);

  // メモリ内フィルタ（Firestoreで直接サポートしにくいもの）
  if (options.subjectType) {
    logs = logs.filter((l) => l.subjectType === options.subjectType);
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
    const search = options.q.toLowerCase();
    logs = logs.filter(
      (l) =>
        l.summary.toLowerCase().includes(search) ||
        (l.detail && l.detail.toLowerCase().includes(search))
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
export async function getFamilyLogById(
  id: string,
  viewer: ViewerContext
): Promise<FamilyContactLog | null> {
  const db = getAdminDb();
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;

  const log = docToFamilyContactLog(doc);

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
export async function createFamilyLog(
  request: CreateFamilyLogRequest,
  actorUserId: string
): Promise<FamilyContactLog> {
  const db = getAdminDb();
  const docRef = db.collection(COLLECTION).doc();
  const timestamp = now();

  const log: FamilyContactLog = {
    id: docRef.id,
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
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await docRef.set(log);
  await addEvent(log.id, actorUserId, 'create', null, log as unknown as Record<string, unknown>);

  return log;
}

/**
 * 連絡ログを更新
 */
export async function updateFamilyLog(
  id: string,
  patch: UpdateFamilyLogRequest,
  actorUserId: string
): Promise<FamilyContactLog | null> {
  const db = getAdminDb();
  const docRef = db.collection(COLLECTION).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const log = docToFamilyContactLog(doc);
  const before = { ...log };

  const updates: Record<string, unknown> = {};

  if (patch.contactType !== undefined) { updates.contactType = patch.contactType; log.contactType = patch.contactType; }
  if (patch.direction !== undefined) { updates.direction = patch.direction; log.direction = patch.direction; }
  if (patch.category !== undefined) { updates.category = patch.category; log.category = patch.category; }
  if (patch.importance !== undefined) { updates.importance = patch.importance; log.importance = patch.importance; }
  if (patch.counterpartName !== undefined) { updates.counterpartName = patch.counterpartName; log.counterpartName = patch.counterpartName; }
  if (patch.counterpartRelation !== undefined) { updates.counterpartRelation = patch.counterpartRelation; log.counterpartRelation = patch.counterpartRelation; }
  if (patch.summary !== undefined) { updates.summary = patch.summary; log.summary = patch.summary; }
  if (patch.detail !== undefined) { updates.detail = patch.detail; log.detail = patch.detail; }
  if (patch.occurredAt !== undefined) { updates.occurredAt = patch.occurredAt; log.occurredAt = patch.occurredAt; }
  if (patch.relatedType !== undefined) { updates.relatedType = patch.relatedType; log.relatedType = patch.relatedType; }
  if (patch.relatedId !== undefined) { updates.relatedId = patch.relatedId; log.relatedId = patch.relatedId; }

  const timestamp = now();
  updates.updatedAt = timestamp;
  log.updatedAt = timestamp;

  await docRef.update(updates);
  await addEvent(
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
export async function getFamilyLogEvents(logId: string): Promise<FamilyContactLogEvent[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTION)
    .doc(logId)
    .collection(EVENTS_SUBCOLLECTION)
    .orderBy('createdAt', 'asc')
    .get();

  return snap.docs.map(docToEvent);
}

/**
 * 統計を取得（manager以上）
 */
export async function getFamilyLogStats(): Promise<FamilyLogStats> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).get();
  const logs = snap.docs.map(docToFamilyContactLog);
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
    stats.byCategory[log.category as FamilyLogCategory]++;
  }

  return stats;
}

/**
 * 重要ログをスキャン（通知用）
 */
export async function scanCriticalLogs(): Promise<FamilyContactLog[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTION)
    .where('importance', '==', 'critical')
    .get();

  return snap.docs.map(docToFamilyContactLog);
}

/**
 * 今週の重要ログ件数を取得
 */
export async function getWeeklyCriticalCount(): Promise<number> {
  const db = getAdminDb();
  const weekStart = getWeekStart();

  const snap = await db
    .collection(COLLECTION)
    .where('importance', '==', 'critical')
    .where('occurredAt', '>=', weekStart.toISOString())
    .get();

  return snap.size;
}
