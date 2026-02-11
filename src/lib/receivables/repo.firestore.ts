/**
 * 未収管理（Receivables）Firestoreリポジトリ
 *
 * PROD: Cloud Firestore永続化
 *
 * コレクション:
 * - receivables: 未収本体
 * - receivable_actions: アクションログ
 * - receivable_events: 監査ログ
 */

import { getAdminDb } from '../firebase-admin';
import type {
  Receivable,
  ReceivableAction,
  ReceivableEvent,
  ReceivableStatus,
  ReceivablePriority,
  ReceivableActionType,
  ReceivableActionOutcome,
  NextActionType,
  ReceivableSubjectType,
  ViewerContext,
} from './types';
import {
  canViewReceivables,
  canEditReceivables,
  isOwnAssignmentOnly,
  calculateAgingDays,
  isOverdue,
} from './types';

// ========== 定数 ==========

const RECEIVABLES_COLLECTION = 'receivables';
const ACTIONS_COLLECTION = 'receivable_actions';
const EVENTS_COLLECTION = 'receivable_events';

// ========== ユーティリティ ==========

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ========== ドキュメント変換 ==========

function docToReceivable(doc: FirebaseFirestore.DocumentSnapshot): Receivable {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    businessUnitId: d.businessUnitId ?? null,
    subjectType: d.subjectType ?? 'other',
    subjectId: d.subjectId ?? null,
    subjectName: d.subjectName ?? '',
    invoiceNo: d.invoiceNo ?? null,
    period: d.period ?? null,
    description: d.description ?? null,
    amount: d.amount ?? 0,
    currency: d.currency ?? 'JPY',
    issuedAt: d.issuedAt ?? null,
    dueAt: d.dueAt ?? '',
    agingDays: d.agingDays ?? null,
    status: d.status ?? 'open',
    priority: d.priority ?? 'normal',
    ownerUserId: d.ownerUserId ?? null,
    ownerRole: d.ownerRole ?? null,
    promisedAt: d.promisedAt ?? null,
    paidAmount: d.paidAmount ?? null,
    paidAt: d.paidAt ?? null,
    riskNote: d.riskNote ?? null,
    nextActionAt: d.nextActionAt ?? null,
    nextActionType: d.nextActionType ?? null,
    createdByUserId: d.createdByUserId ?? '',
    createdAt: d.createdAt ?? now(),
    updatedAt: d.updatedAt ?? now(),
  };
}

function docToAction(doc: FirebaseFirestore.DocumentSnapshot): ReceivableAction {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    receivableId: d.receivableId ?? '',
    actionType: d.actionType ?? 'other',
    occurredAt: d.occurredAt ?? '',
    actorUserId: d.actorUserId ?? null,
    summary: d.summary ?? '',
    detail: d.detail ?? null,
    outcome: d.outcome ?? null,
    promisedAt: d.promisedAt ?? null,
    amountPaid: d.amountPaid ?? null,
    nextActionAt: d.nextActionAt ?? null,
    note: d.note ?? null,
    createdAt: d.createdAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): ReceivableEvent {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    receivableId: d.receivableId ?? '',
    actorUserId: d.actorUserId ?? '',
    action: d.action ?? 'update',
    beforeJson: d.beforeJson ?? null,
    afterJson: d.afterJson ?? null,
    createdAt: d.createdAt ?? now(),
    note: d.note ?? null,
  };
}

// ========== 監査ログ記録 ==========

async function logEvent(
  receivableId: string,
  actorUserId: string,
  action: ReceivableEvent['action'],
  beforeData: Receivable | null,
  afterData: Receivable | null,
  note: string | null = null
): Promise<void> {
  const db = getAdminDb();
  const eventId = generateId('evt');
  const event: ReceivableEvent = {
    id: eventId,
    receivableId,
    actorUserId,
    action,
    beforeJson: beforeData ? JSON.stringify(beforeData) : null,
    afterJson: afterData ? JSON.stringify(afterData) : null,
    createdAt: now(),
    note,
  };
  await db.collection(EVENTS_COLLECTION).doc(eventId).set(event);
}

// ========== フィルタリング ==========

export interface ReceivableFilters {
  status?: ReceivableStatus;
  priority?: ReceivablePriority;
  overdue?: boolean;
  agingMinDays?: number;
  amountMin?: number;
  ownerUserId?: string;
  businessUnitId?: string;
  q?: string;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

// ========== CRUD ==========

/**
 * 一覧取得
 */
export async function listReceivables(
  viewer: ViewerContext,
  filters: ReceivableFilters = {},
  pagination: PaginationParams = { limit: 50, offset: 0 }
): Promise<{ items: Receivable[]; total: number }> {
  const viewable = canViewReceivables(viewer.role);
  const ownOnly = isOwnAssignmentOnly(viewer.role);

  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(RECEIVABLES_COLLECTION);

  // Firestore-level filters where possible
  if (filters.status) {
    query = query.where('status', '==', filters.status);
  }
  if (filters.priority) {
    query = query.where('priority', '==', filters.priority);
  }
  if (filters.ownerUserId) {
    query = query.where('ownerUserId', '==', filters.ownerUserId);
  }
  if (filters.businessUnitId) {
    query = query.where('businessUnitId', '==', filters.businessUnitId);
  }

  // RBAC: staff/leader は担当分のみ
  if (!viewable && ownOnly) {
    query = query.where('ownerUserId', '==', viewer.userId);
  } else if (!viewable) {
    return { items: [], total: 0 };
  }

  const snapshot = await query.get();
  let items = snapshot.docs.map(docToReceivable);

  // Client-side filters that can't be done in Firestore
  if (filters.overdue) {
    items = items.filter((r) => isOverdue(r));
  }
  if (filters.agingMinDays !== undefined) {
    items = items.filter((r) => {
      const aging = calculateAgingDays(r.dueAt);
      return aging >= filters.agingMinDays!;
    });
  }
  if (filters.amountMin !== undefined) {
    items = items.filter((r) => r.amount >= filters.amountMin!);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    items = items.filter(
      (r) =>
        r.subjectName.toLowerCase().includes(q) ||
        (r.invoiceNo && r.invoiceNo.toLowerCase().includes(q))
    );
  }

  // agingDays を計算して更新
  items = items.map((r) => ({
    ...r,
    agingDays: isOverdue(r) ? calculateAgingDays(r.dueAt) : 0,
  }));

  // ソート: 期限超過日数（降順）、金額（降順）
  items.sort((a, b) => {
    if ((b.agingDays ?? 0) !== (a.agingDays ?? 0)) {
      return (b.agingDays ?? 0) - (a.agingDays ?? 0);
    }
    return b.amount - a.amount;
  });

  const total = items.length;
  const paged = items.slice(pagination.offset, pagination.offset + pagination.limit);

  return { items: paged, total };
}

/**
 * 詳細取得
 */
export async function getById(id: string, viewer: ViewerContext): Promise<Receivable | null> {
  const db = getAdminDb();
  const doc = await db.collection(RECEIVABLES_COLLECTION).doc(id).get();
  if (!doc.exists) return null;

  const receivable = docToReceivable(doc);

  // 権限チェック
  const viewable = canViewReceivables(viewer.role);
  const ownOnly = isOwnAssignmentOnly(viewer.role);

  if (!viewable && ownOnly) {
    if (receivable.ownerUserId !== viewer.userId) {
      return null;
    }
  } else if (!viewable) {
    return null;
  }

  return {
    ...receivable,
    agingDays: isOverdue(receivable) ? calculateAgingDays(receivable.dueAt) : 0,
  };
}

/**
 * 作成
 */
export interface CreateReceivableInput {
  subjectType: ReceivableSubjectType;
  subjectId?: string | null;
  subjectName: string;
  invoiceNo?: string | null;
  period?: string | null;
  description?: string | null;
  amount: number;
  dueAt: string;
  issuedAt?: string | null;
  priority?: ReceivablePriority;
  ownerUserId?: string | null;
  nextActionAt?: string | null;
  nextActionType?: NextActionType;
  businessUnitId?: string | null;
}

export async function createReceivable(
  input: CreateReceivableInput,
  actorUserId: string
): Promise<Receivable> {
  const db = getAdminDb();
  const id = generateId('recv');
  const timestamp = now();

  const receivable: Receivable = {
    id,
    businessUnitId: input.businessUnitId ?? null,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    subjectName: input.subjectName,
    invoiceNo: input.invoiceNo ?? null,
    period: input.period ?? null,
    description: input.description ?? null,
    amount: input.amount,
    currency: 'JPY',
    issuedAt: input.issuedAt ?? null,
    dueAt: input.dueAt,
    agingDays: null,
    status: 'open',
    priority: input.priority ?? 'normal',
    ownerUserId: input.ownerUserId ?? null,
    ownerRole: null,
    promisedAt: null,
    paidAmount: null,
    paidAt: null,
    riskNote: null,
    nextActionAt: input.nextActionAt ?? null,
    nextActionType: input.nextActionType ?? null,
    createdByUserId: actorUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(RECEIVABLES_COLLECTION).doc(id).set(receivable);
  await logEvent(id, actorUserId, 'create', null, receivable);

  return receivable;
}

/**
 * 更新
 */
export interface UpdateReceivableInput {
  subjectName?: string;
  invoiceNo?: string | null;
  period?: string | null;
  description?: string | null;
  amount?: number;
  dueAt?: string;
  issuedAt?: string | null;
  priority?: ReceivablePriority;
  riskNote?: string | null;
  nextActionAt?: string | null;
  nextActionType?: NextActionType;
  businessUnitId?: string | null;
}

export async function updateReceivable(
  id: string,
  patch: UpdateReceivableInput,
  actorUserId: string
): Promise<Receivable | null> {
  const db = getAdminDb();
  const docRef = db.collection(RECEIVABLES_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const existing = docToReceivable(doc);

  const updated: Receivable = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };

  await docRef.set(updated);
  await logEvent(id, actorUserId, 'update', existing, updated);

  return updated;
}

/**
 * 担当割当
 */
export async function assignOwner(
  id: string,
  ownerUserId: string | null,
  actorUserId: string
): Promise<Receivable | null> {
  const db = getAdminDb();
  const docRef = db.collection(RECEIVABLES_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const existing = docToReceivable(doc);

  const updated: Receivable = {
    ...existing,
    ownerUserId,
    updatedAt: now(),
  };

  await docRef.set(updated);
  await logEvent(id, actorUserId, 'assign', existing, updated);

  return updated;
}

/**
 * ステータス変更
 */
export async function changeStatus(
  id: string,
  status: ReceivableStatus,
  actorUserId: string
): Promise<Receivable | null> {
  const db = getAdminDb();
  const docRef = db.collection(RECEIVABLES_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const existing = docToReceivable(doc);

  const updated: Receivable = {
    ...existing,
    status,
    updatedAt: now(),
  };

  await docRef.set(updated);
  await logEvent(id, actorUserId, 'status_change', existing, updated);

  return updated;
}

/**
 * 完済
 */
export async function markPaid(
  id: string,
  paidAt: string,
  actorUserId: string
): Promise<Receivable | null> {
  const db = getAdminDb();
  const docRef = db.collection(RECEIVABLES_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const existing = docToReceivable(doc);

  const updated: Receivable = {
    ...existing,
    status: 'paid',
    paidAt,
    paidAmount: existing.amount,
    updatedAt: now(),
  };

  await docRef.set(updated);
  await logEvent(id, actorUserId, 'mark_paid', existing, updated);

  return updated;
}

/**
 * 貸倒
 */
export async function writeOff(
  id: string,
  note: string | null,
  actorUserId: string
): Promise<Receivable | null> {
  const db = getAdminDb();
  const docRef = db.collection(RECEIVABLES_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const existing = docToReceivable(doc);

  const updated: Receivable = {
    ...existing,
    status: 'writeoff',
    riskNote: note ?? existing.riskNote,
    updatedAt: now(),
  };

  await docRef.set(updated);
  await logEvent(id, actorUserId, 'writeoff', existing, updated, note);

  return updated;
}

// ========== アクションログ ==========

export interface AddActionInput {
  actionType: ReceivableActionType;
  occurredAt?: string;
  summary: string;
  detail?: string | null;
  outcome?: ReceivableActionOutcome;
  promisedAt?: string | null;
  amountPaid?: number | null;
  nextActionAt?: string | null;
}

/**
 * アクション追加
 */
export async function addAction(
  receivableId: string,
  input: AddActionInput,
  actorUserId: string
): Promise<ReceivableAction | null> {
  const db = getAdminDb();
  const recvRef = db.collection(RECEIVABLES_COLLECTION).doc(receivableId);
  const recvDoc = await recvRef.get();
  if (!recvDoc.exists) return null;

  const receivable = docToReceivable(recvDoc);

  const actionId = generateId('act');
  const timestamp = now();

  const action: ReceivableAction = {
    id: actionId,
    receivableId,
    actionType: input.actionType,
    occurredAt: input.occurredAt ?? timestamp,
    actorUserId,
    summary: input.summary,
    detail: input.detail ?? null,
    outcome: input.outcome ?? null,
    promisedAt: input.promisedAt ?? null,
    amountPaid: input.amountPaid ?? null,
    nextActionAt: input.nextActionAt ?? null,
    note: null,
    createdAt: timestamp,
  };

  await db.collection(ACTIONS_COLLECTION).doc(actionId).set(action);

  // receivable の整合性更新
  const updates: Partial<Receivable> = {
    updatedAt: timestamp,
  };

  if (input.nextActionAt) {
    updates.nextActionAt = input.nextActionAt;
  }

  if (input.outcome === 'promised' && input.promisedAt) {
    updates.promisedAt = input.promisedAt;
    updates.status = 'promised';
  }

  if (input.outcome === 'partial_paid' && input.amountPaid) {
    updates.paidAmount = (receivable.paidAmount ?? 0) + input.amountPaid;
    updates.status = 'partial';
  }

  if (input.outcome === 'paid') {
    updates.status = 'paid';
    updates.paidAt = today();
    updates.paidAmount = receivable.amount;
  }

  if (input.outcome === 'disputed') {
    updates.status = 'disputed';
  }

  const updatedReceivable = { ...receivable, ...updates };
  await recvRef.set(updatedReceivable);
  await logEvent(receivableId, actorUserId, 'add_action', receivable, updatedReceivable);

  return action;
}

/**
 * アクションログ取得
 */
export async function getActions(
  receivableId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ actions: ReceivableAction[]; total: number }> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(ACTIONS_COLLECTION)
    .where('receivableId', '==', receivableId)
    .orderBy('occurredAt', 'desc')
    .get();

  const actions = snapshot.docs.map(docToAction);
  const total = actions.length;
  const paged = actions.slice(offset, offset + limit);

  return { actions: paged, total };
}

// ========== 監査ログ取得 ==========

export async function getEvents(
  receivableId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ events: ReceivableEvent[]; total: number }> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(EVENTS_COLLECTION)
    .where('receivableId', '==', receivableId)
    .orderBy('createdAt', 'desc')
    .get();

  const events = snapshot.docs.map(docToEvent);
  const total = events.length;
  const paged = events.slice(offset, offset + limit);

  return { events: paged, total };
}

// ========== 統計 ==========

export interface ReceivableStats {
  openTotal: number;
  overdueTotal: number;
  overdueCount: number;
  criticalOverdueCount: number;
  aging60Count: number;
  countByStatus: Record<ReceivableStatus, number>;
  agingBuckets: {
    '1-30': number;
    '31-60': number;
    '61-90': number;
    '90+': number;
  };
  totalAmount: number;
}

export interface StatsFilterOptions {
  businessUnitId?: string;
}

export async function getStats(viewer: ViewerContext, options: StatsFilterOptions = {}): Promise<ReceivableStats | null> {
  if (!canViewReceivables(viewer.role)) {
    return null;
  }

  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(RECEIVABLES_COLLECTION);

  if (options.businessUnitId) {
    query = query.where('businessUnitId', '==', options.businessUnitId);
  }

  const snapshot = await query.get();
  const items = snapshot.docs.map(docToReceivable);

  const openItems = items.filter((r) => !['paid', 'writeoff', 'archived'].includes(r.status));
  const overdueItems = items.filter((r) => isOverdue(r));

  const countByStatus: Record<ReceivableStatus, number> = {
    open: 0,
    in_collection: 0,
    promised: 0,
    partial: 0,
    disputed: 0,
    paid: 0,
    writeoff: 0,
    archived: 0,
  };

  items.forEach((r) => {
    countByStatus[r.status]++;
  });

  const agingBuckets = {
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  };

  let aging60Count = 0;

  overdueItems.forEach((r) => {
    const aging = calculateAgingDays(r.dueAt);
    if (aging <= 30) {
      agingBuckets['1-30'] += r.amount;
    } else if (aging <= 60) {
      agingBuckets['31-60'] += r.amount;
    } else if (aging <= 90) {
      agingBuckets['61-90'] += r.amount;
      aging60Count++;
    } else {
      agingBuckets['90+'] += r.amount;
      aging60Count++;
    }
  });

  return {
    openTotal: openItems.reduce((sum, r) => sum + r.amount, 0),
    overdueTotal: overdueItems.reduce((sum, r) => sum + r.amount, 0),
    overdueCount: overdueItems.length,
    criticalOverdueCount: overdueItems.filter((r) => r.priority === 'critical').length,
    aging60Count,
    countByStatus,
    agingBuckets,
    totalAmount: items.reduce((sum, r) => sum + r.amount, 0),
  };
}

// ========== リスクスキャン ==========

export interface ReceivableRisk {
  receivable: Receivable;
  riskType: 'overdue' | 'high_amount' | 'long_aging';
  agingDays: number;
}

export async function scanReceivableRisks(): Promise<ReceivableRisk[]> {
  const db = getAdminDb();
  const snapshot = await db.collection(RECEIVABLES_COLLECTION).get();
  const items = snapshot.docs.map(docToReceivable);

  const risks: ReceivableRisk[] = [];

  items.forEach((r) => {
    if (['paid', 'writeoff', 'archived'].includes(r.status)) {
      return;
    }

    const aging = calculateAgingDays(r.dueAt);
    const overdue = isOverdue(r);

    if (overdue && r.amount >= 100000) {
      risks.push({
        receivable: r,
        riskType: 'high_amount',
        agingDays: aging,
      });
    } else if (aging >= 60) {
      risks.push({
        receivable: r,
        riskType: 'long_aging',
        agingDays: aging,
      });
    } else if (overdue) {
      risks.push({
        receivable: r,
        riskType: 'overdue',
        agingDays: aging,
      });
    }
  });

  risks.sort((a, b) => b.receivable.amount - a.receivable.amount);

  return risks;
}
