/**
 * Scope Backfill リポジトリ（Firestore版）
 *
 * Implementation Ticket 032: businessUnitId 未分類データの一括付与
 * Firestore永続化実装
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  BackfillEntityType,
  BackfillFilters,
  BackfillPreviewResponse,
  BackfillApplyResponse,
  BackfillSampleItem,
  ScopeBackfillEvent,
  AdminViewerContext,
} from './types';

// 他のリポジトリからインポート
import { listTickets, updateTicket } from '@/lib/tickets/repo';
import { listRepairs, updateRepair } from '@/lib/repairs/repo';
import { listCorrectiveActions, update as updateCorrectiveAction } from '@/lib/correctiveActions/repo.firestore';
import { getBusinessUnitById } from '@/lib/business/repo';

// ========== コレクション名 ==========

const BACKFILL_EVENTS_COLLECTION = 'scope_backfill_events';

// ========== ドキュメント変換 ==========

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): ScopeBackfillEvent {
  const d = doc.data()!;
  return {
    id: doc.id,
    actorUserId: d.actorUserId,
    actorUserName: d.actorUserName ?? null,
    entityType: d.entityType,
    filterJson: d.filterJson,
    targetBusinessUnitId: d.targetBusinessUnitId,
    targetBusinessUnitName: d.targetBusinessUnitName ?? null,
    affectedCount: d.affectedCount,
    dryRun: d.dryRun,
    createdAt: d.createdAt,
  };
}

function now(): string {
  return new Date().toISOString();
}

// ========== 監査ログ操作 ==========

export async function listBackfillEvents(limit: number = 50): Promise<ScopeBackfillEvent[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(BACKFILL_EVENTS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(docToEvent);
}

export async function getBackfillEventById(id: string): Promise<ScopeBackfillEvent | null> {
  const db = getAdminDb();
  const doc = await db.collection(BACKFILL_EVENTS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return docToEvent(doc);
}

async function recordBackfillEvent(
  viewer: AdminViewerContext,
  entityType: BackfillEntityType,
  filters: BackfillFilters,
  targetBusinessUnitId: string,
  affectedCount: number,
  dryRun: boolean
): Promise<ScopeBackfillEvent> {
  const db = getAdminDb();
  const businessUnit = getBusinessUnitById(targetBusinessUnitId);

  const docRef = db.collection(BACKFILL_EVENTS_COLLECTION).doc();
  const eventData = {
    actorUserId: viewer.userId,
    actorUserName: viewer.userName,
    entityType,
    filterJson: JSON.stringify(filters),
    targetBusinessUnitId,
    targetBusinessUnitName: businessUnit?.name ?? null,
    affectedCount,
    dryRun,
    createdAt: now(),
  };

  await docRef.set(eventData);

  return {
    id: docRef.id,
    ...eventData,
  };
}

// ========== プレビュー ==========

export async function preview(
  viewer: AdminViewerContext,
  entityType: BackfillEntityType,
  filters: BackfillFilters,
  targetBusinessUnitId: string
): Promise<{ success: true; data: BackfillPreviewResponse } | { success: false; error: string }> {
  // 事業単位の存在チェック
  const businessUnit = getBusinessUnitById(targetBusinessUnitId);
  if (!businessUnit) {
    return { success: false, error: '指定された事業単位が存在しません' };
  }

  // onlyUnclassified を強制
  const safeFilters: BackfillFilters = { ...filters, onlyUnclassified: true };
  const limit = safeFilters.limit ?? 200;

  let items: BackfillSampleItem[] = [];
  let totalCount = 0;

  switch (entityType) {
    case 'tickets':
      const ticketResult = previewTickets(safeFilters, limit);
      items = ticketResult.items;
      totalCount = ticketResult.count;
      break;

    case 'repairs':
      const repairResult = previewRepairs(safeFilters, limit);
      items = repairResult.items;
      totalCount = repairResult.count;
      break;

    case 'correctiveActions':
      const caResult = await previewCorrectiveActions(safeFilters, limit);
      items = caResult.items;
      totalCount = caResult.count;
      break;

    case 'complaints':
      return { success: false, error: 'complaints のバックフィルは未実装です' };

    default:
      return { success: false, error: `未知のエンティティタイプ: ${entityType}` };
  }

  return {
    success: true,
    data: {
      count: totalCount,
      sample: items.slice(0, limit),
    },
  };
}

// ========== 適用 ==========

export async function apply(
  viewer: AdminViewerContext,
  entityType: BackfillEntityType,
  filters: BackfillFilters,
  targetBusinessUnitId: string
): Promise<{ success: true; data: BackfillApplyResponse } | { success: false; error: string }> {
  // 事業単位の存在チェック
  const businessUnit = getBusinessUnitById(targetBusinessUnitId);
  if (!businessUnit) {
    return { success: false, error: '指定された事業単位が存在しません' };
  }

  // onlyUnclassified を強制
  const safeFilters: BackfillFilters = { ...filters, onlyUnclassified: true };

  let affectedCount = 0;

  switch (entityType) {
    case 'tickets':
      affectedCount = applyTickets(safeFilters, targetBusinessUnitId);
      break;

    case 'repairs':
      affectedCount = applyRepairs(safeFilters, targetBusinessUnitId);
      break;

    case 'correctiveActions':
      affectedCount = await applyCorrectiveActions(safeFilters, targetBusinessUnitId);
      break;

    case 'complaints':
      return { success: false, error: 'complaints のバックフィルは未実装です' };

    default:
      return { success: false, error: `未知のエンティティタイプ: ${entityType}` };
  }

  // 監査ログを記録（Firestore）
  const event = await recordBackfillEvent(
    viewer,
    entityType,
    safeFilters,
    targetBusinessUnitId,
    affectedCount,
    false
  );

  return {
    success: true,
    data: {
      affectedCount,
      eventId: event.id,
    },
  };
}

// ========== Tickets 実装 ==========

function previewTickets(
  filters: BackfillFilters,
  limit: number
): { items: BackfillSampleItem[]; count: number } {
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = listTickets({}, viewer);

  let tickets = result.items.filter((t) => t.businessUnitId === null);

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    tickets = tickets.filter((t) => new Date(t.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    tickets = tickets.filter((t) => new Date(t.createdAt) <= to);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    tickets = tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }
  if (filters.status && filters.status.length > 0) {
    tickets = tickets.filter((t) => filters.status!.includes(t.status));
  }

  const count = tickets.length;
  const items: BackfillSampleItem[] = tickets.slice(0, limit).map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.createdAt,
    hint: `${t.status} / ${t.priority} / ${t.category}`,
  }));

  return { items, count };
}

function applyTickets(filters: BackfillFilters, targetBusinessUnitId: string): number {
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = listTickets({}, viewer);

  let tickets = result.items.filter((t) => t.businessUnitId === null);

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    tickets = tickets.filter((t) => new Date(t.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    tickets = tickets.filter((t) => new Date(t.createdAt) <= to);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    tickets = tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }
  if (filters.status && filters.status.length > 0) {
    tickets = tickets.filter((t) => filters.status!.includes(t.status));
  }

  let count = 0;
  for (const ticket of tickets) {
    const updateResult = updateTicket(ticket.id, { businessUnitId: targetBusinessUnitId }, viewer);
    if (updateResult.success) {
      count++;
    }
  }

  return count;
}

// ========== Repairs 実装 ==========

function previewRepairs(
  filters: BackfillFilters,
  limit: number
): { items: BackfillSampleItem[]; count: number } {
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = listRepairs(viewer, {});

  let repairs = result.repairs.filter((r) => r.businessUnitId === null);

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    repairs = repairs.filter((r) => new Date(r.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    repairs = repairs.filter((r) => new Date(r.createdAt) <= to);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    repairs = repairs.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.location && r.location.toLowerCase().includes(q))
    );
  }
  if (filters.status && filters.status.length > 0) {
    repairs = repairs.filter((r) => filters.status!.includes(r.status));
  }

  const count = repairs.length;
  const items: BackfillSampleItem[] = repairs.slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    hint: `${r.status} / ${r.safetyRisk} / ${r.category}`,
  }));

  return { items, count };
}

function applyRepairs(filters: BackfillFilters, targetBusinessUnitId: string): number {
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = listRepairs(viewer, {});

  let repairs = result.repairs.filter((r) => r.businessUnitId === null);

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    repairs = repairs.filter((r) => new Date(r.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    repairs = repairs.filter((r) => new Date(r.createdAt) <= to);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    repairs = repairs.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.location && r.location.toLowerCase().includes(q))
    );
  }
  if (filters.status && filters.status.length > 0) {
    repairs = repairs.filter((r) => filters.status!.includes(r.status));
  }

  let count = 0;
  for (const repair of repairs) {
    const updateResult = updateRepair(repair.id, { businessUnitId: targetBusinessUnitId }, viewer);
    if (updateResult.success) {
      count++;
    }
  }

  return count;
}

// ========== CorrectiveActions 実装 ==========

async function previewCorrectiveActions(
  filters: BackfillFilters,
  limit: number
): Promise<{ items: BackfillSampleItem[]; count: number }> {
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = await listCorrectiveActions(viewer, {});

  let actions = result.items.filter((ca) => ca.businessUnitId === null);

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    actions = actions.filter((ca) => new Date(ca.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    actions = actions.filter((ca) => new Date(ca.createdAt) <= to);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    actions = actions.filter((ca) => ca.title.toLowerCase().includes(q));
  }
  if (filters.status && filters.status.length > 0) {
    actions = actions.filter((ca) => filters.status!.includes(ca.status));
  }

  const count = actions.length;
  const items: BackfillSampleItem[] = actions.slice(0, limit).map((ca) => ({
    id: ca.id,
    title: ca.title,
    createdAt: ca.createdAt,
    hint: `${ca.status} / ${ca.severity} / ${ca.sourceType}`,
  }));

  return { items, count };
}

async function applyCorrectiveActions(filters: BackfillFilters, targetBusinessUnitId: string): Promise<number> {
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = await listCorrectiveActions(viewer, {});

  let actions = result.items.filter((ca) => ca.businessUnitId === null);

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    actions = actions.filter((ca) => new Date(ca.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    actions = actions.filter((ca) => new Date(ca.createdAt) <= to);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    actions = actions.filter((ca) => ca.title.toLowerCase().includes(q));
  }
  if (filters.status && filters.status.length > 0) {
    actions = actions.filter((ca) => filters.status!.includes(ca.status));
  }

  let count = 0;
  for (const ca of actions) {
    const updateResult = await updateCorrectiveAction(ca.id, { businessUnitId: targetBusinessUnitId }, viewer);
    if (updateResult.success) {
      count++;
    }
  }

  return count;
}
