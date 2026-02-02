/**
 * Scope Backfill リポジトリ
 *
 * Implementation Ticket 032: businessUnitId 未分類データの一括付与
 * インメモリストア実装（本番ではDB置換）
 */

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
import * as ticketsRepo from '@/lib/tickets/repo';
import * as repairsRepo from '@/lib/repairs/repo';
import * as correctiveActionsRepo from '@/lib/correctiveActions/repo';
import * as businessRepo from '@/lib/business/repo';

// ========== 監査ログストレージ ==========

const backfillEventsStore = new Map<string, ScopeBackfillEvent>();
let eventIdCounter = 1;

function generateEventId(): string {
  return `sbf_${String(eventIdCounter++).padStart(5, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== 監査ログ操作 ==========

export function listBackfillEvents(limit: number = 50): ScopeBackfillEvent[] {
  const events = Array.from(backfillEventsStore.values());
  return events
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function getBackfillEventById(id: string): ScopeBackfillEvent | null {
  return backfillEventsStore.get(id) ?? null;
}

function recordBackfillEvent(
  viewer: AdminViewerContext,
  entityType: BackfillEntityType,
  filters: BackfillFilters,
  targetBusinessUnitId: string,
  affectedCount: number,
  dryRun: boolean
): ScopeBackfillEvent {
  const businessUnit = businessRepo.getBusinessUnitById(targetBusinessUnitId);

  const event: ScopeBackfillEvent = {
    id: generateEventId(),
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

  backfillEventsStore.set(event.id, event);
  return event;
}

// ========== プレビュー ==========

export function preview(
  viewer: AdminViewerContext,
  entityType: BackfillEntityType,
  filters: BackfillFilters,
  targetBusinessUnitId: string
): { success: true; data: BackfillPreviewResponse } | { success: false; error: string } {
  // 事業単位の存在チェック
  const businessUnit = businessRepo.getBusinessUnitById(targetBusinessUnitId);
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
      const caResult = previewCorrectiveActions(safeFilters, limit);
      items = caResult.items;
      totalCount = caResult.count;
      break;

    case 'complaints':
      // complaints は後で実装
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

export function apply(
  viewer: AdminViewerContext,
  entityType: BackfillEntityType,
  filters: BackfillFilters,
  targetBusinessUnitId: string
): { success: true; data: BackfillApplyResponse } | { success: false; error: string } {
  // 事業単位の存在チェック
  const businessUnit = businessRepo.getBusinessUnitById(targetBusinessUnitId);
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
      affectedCount = applyCorrectiveActions(safeFilters, targetBusinessUnitId);
      break;

    case 'complaints':
      return { success: false, error: 'complaints のバックフィルは未実装です' };

    default:
      return { success: false, error: `未知のエンティティタイプ: ${entityType}` };
  }

  // 監査ログを記録
  const event = recordBackfillEvent(
    viewer,
    entityType,
    safeFilters,
    targetBusinessUnitId,
    affectedCount,
    false  // dryRun = false
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
  // 管理者権限でフルアクセス
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = ticketsRepo.listTickets(viewer, {});

  let tickets = result.tickets.filter((t) => t.businessUnitId === null);

  // 日付フィルタ
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    tickets = tickets.filter((t) => new Date(t.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    tickets = tickets.filter((t) => new Date(t.createdAt) <= to);
  }

  // 検索フィルタ
  if (filters.q) {
    const q = filters.q.toLowerCase();
    tickets = tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }

  // ステータスフィルタ
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
  const result = ticketsRepo.listTickets(viewer, {});

  let tickets = result.tickets.filter((t) => t.businessUnitId === null);

  // 日付フィルタ
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    tickets = tickets.filter((t) => new Date(t.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    tickets = tickets.filter((t) => new Date(t.createdAt) <= to);
  }

  // 検索フィルタ
  if (filters.q) {
    const q = filters.q.toLowerCase();
    tickets = tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }

  // ステータスフィルタ
  if (filters.status && filters.status.length > 0) {
    tickets = tickets.filter((t) => filters.status!.includes(t.status));
  }

  // 一括更新
  let count = 0;
  for (const ticket of tickets) {
    const updateResult = ticketsRepo.updateTicket(ticket.id, { businessUnitId: targetBusinessUnitId }, viewer);
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
  const result = repairsRepo.listRepairs(viewer, {});

  let repairs = result.repairs.filter((r) => r.businessUnitId === null);

  // 日付フィルタ
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    repairs = repairs.filter((r) => new Date(r.reportedAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    repairs = repairs.filter((r) => new Date(r.reportedAt) <= to);
  }

  // 検索フィルタ
  if (filters.q) {
    const q = filters.q.toLowerCase();
    repairs = repairs.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.location && r.location.toLowerCase().includes(q))
    );
  }

  // ステータスフィルタ
  if (filters.status && filters.status.length > 0) {
    repairs = repairs.filter((r) => filters.status!.includes(r.status));
  }

  const count = repairs.length;
  const items: BackfillSampleItem[] = repairs.slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.reportedAt,
    hint: `${r.status} / ${r.safetyRisk} / ${r.category}`,
  }));

  return { items, count };
}

function applyRepairs(filters: BackfillFilters, targetBusinessUnitId: string): number {
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = repairsRepo.listRepairs(viewer, {});

  let repairs = result.repairs.filter((r) => r.businessUnitId === null);

  // 日付フィルタ
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    repairs = repairs.filter((r) => new Date(r.reportedAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    repairs = repairs.filter((r) => new Date(r.reportedAt) <= to);
  }

  // 検索フィルタ
  if (filters.q) {
    const q = filters.q.toLowerCase();
    repairs = repairs.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.location && r.location.toLowerCase().includes(q))
    );
  }

  // ステータスフィルタ
  if (filters.status && filters.status.length > 0) {
    repairs = repairs.filter((r) => filters.status!.includes(r.status));
  }

  // 一括更新
  let count = 0;
  for (const repair of repairs) {
    const updateResult = repairsRepo.update(repair.id, { businessUnitId: targetBusinessUnitId }, viewer);
    if (updateResult.success) {
      count++;
    }
  }

  return count;
}

// ========== CorrectiveActions 実装 ==========

function previewCorrectiveActions(
  filters: BackfillFilters,
  limit: number
): { items: BackfillSampleItem[]; count: number } {
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = correctiveActionsRepo.list(viewer, {});

  let actions = result.items.filter((ca) => ca.businessUnitId === null);

  // 日付フィルタ
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    actions = actions.filter((ca) => new Date(ca.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    actions = actions.filter((ca) => new Date(ca.createdAt) <= to);
  }

  // 検索フィルタ
  if (filters.q) {
    const q = filters.q.toLowerCase();
    actions = actions.filter((ca) => ca.title.toLowerCase().includes(q));
  }

  // ステータスフィルタ
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

function applyCorrectiveActions(filters: BackfillFilters, targetBusinessUnitId: string): number {
  const viewer = { userId: 'admin', role: 'admin' as const };
  const result = correctiveActionsRepo.list(viewer, {});

  let actions = result.items.filter((ca) => ca.businessUnitId === null);

  // 日付フィルタ
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    actions = actions.filter((ca) => new Date(ca.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    actions = actions.filter((ca) => new Date(ca.createdAt) <= to);
  }

  // 検索フィルタ
  if (filters.q) {
    const q = filters.q.toLowerCase();
    actions = actions.filter((ca) => ca.title.toLowerCase().includes(q));
  }

  // ステータスフィルタ
  if (filters.status && filters.status.length > 0) {
    actions = actions.filter((ca) => filters.status!.includes(ca.status));
  }

  // 一括更新
  let count = 0;
  for (const ca of actions) {
    const updateResult = correctiveActionsRepo.update(ca.id, { businessUnitId: targetBusinessUnitId }, viewer);
    if (updateResult.success) {
      count++;
    }
  }

  return count;
}
