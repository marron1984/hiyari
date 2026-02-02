/**
 * Unclassified Management リポジトリ
 *
 * Implementation Ticket 034: 未分類を現場で即解消できるUI + 一括付与
 */

import type {
  UnclassifiedItem,
  UnclassifiedListResponse,
  UnclassifiedListFilter,
  UnclassifiedAssignRequest,
  UnclassifiedAssignResponse,
} from './types';
import type { BackfillEntityType, ScopeBackfillEvent, AdminViewerContext } from '../backfill/types';

// 他のリポジトリからインポート
import { listTickets, updateTicket, getTicketById } from '@/lib/tickets/repo';
import { listRepairs, updateRepair, getRepairById } from '@/lib/repairs/repo';
import { listCorrectiveActions, update as updateCorrectiveAction, getById as getCorrectiveActionById } from '@/lib/correctiveActions/repo';
import { getBusinessUnitById } from '@/lib/business/repo';

// ========== 監査ログストレージ（backfillと共有） ==========

const unclassifiedEventsStore = new Map<string, ScopeBackfillEvent>();
let eventIdCounter = 1;

function generateEventId(): string {
  return `ucl_${String(eventIdCounter++).padStart(5, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== 監査ログ操作 ==========

export function listUnclassifiedEvents(limit: number = 50): ScopeBackfillEvent[] {
  const events = Array.from(unclassifiedEventsStore.values());
  return events
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

function recordUnclassifiedAssignEvent(
  viewer: AdminViewerContext,
  entityType: BackfillEntityType,
  ids: string[],
  targetBusinessUnitId: string,
  affectedCount: number
): ScopeBackfillEvent {
  const businessUnit = getBusinessUnitById(targetBusinessUnitId);

  const event: ScopeBackfillEvent = {
    id: generateEventId(),
    actorUserId: viewer.userId,
    actorUserName: viewer.userName,
    entityType,
    filterJson: JSON.stringify({
      source: 'ui_unclassified_assign',
      idsCount: ids.length,
      idsSample: ids.slice(0, 5),
    }),
    targetBusinessUnitId,
    targetBusinessUnitName: businessUnit?.name ?? null,
    affectedCount,
    dryRun: false,
    createdAt: now(),
  };

  unclassifiedEventsStore.set(event.id, event);
  return event;
}

// ========== 未分類一覧取得 ==========

const ADMIN_VIEWER = { userId: 'system', role: 'admin' as const };

/**
 * 未分類チケット一覧
 */
export function listUnclassifiedTickets(filter: UnclassifiedListFilter): UnclassifiedListResponse {
  const result = listTickets({
    businessUnitId: null, // 未分類のみ
    q: filter.q,
    limit: filter.limit ?? 100,
    offset: filter.offset ?? 0,
  }, ADMIN_VIEWER);

  const items: UnclassifiedItem[] = result.items.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    createdAt: t.createdAt,
    hint: [
      t.category,
      t.location,
      t.requesterUserName,
    ].filter(Boolean).join(' / ') || '情報なし',
    suggestedBuId: null,
    suggestedBuName: null,
  }));

  return { items, totalCount: result.total };
}

/**
 * 未分類修繕一覧
 */
export function listUnclassifiedRepairs(filter: UnclassifiedListFilter): UnclassifiedListResponse {
  const result = listRepairs(ADMIN_VIEWER, {
    businessUnitId: null, // 未分類のみ
    q: filter.q,
    limit: filter.limit ?? 100,
    offset: filter.offset ?? 0,
  });

  const items: UnclassifiedItem[] = result.repairs.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    createdAt: r.createdAt,
    hint: [
      r.category,
      r.location,
      r.safetyRisk,
    ].filter(Boolean).join(' / ') || '情報なし',
    suggestedBuId: null,
    suggestedBuName: null,
  }));

  return { items, totalCount: result.total };
}

/**
 * 未分類是正措置一覧
 */
export function listUnclassifiedCorrectiveActions(filter: UnclassifiedListFilter): UnclassifiedListResponse {
  const result = listCorrectiveActions(ADMIN_VIEWER, {
    businessUnitId: null, // 未分類のみ
    q: filter.q,
    limit: filter.limit ?? 100,
    offset: filter.offset ?? 0,
  });

  const items: UnclassifiedItem[] = result.items.map((ca) => ({
    id: ca.id,
    title: ca.title,
    status: ca.status,
    createdAt: ca.createdAt,
    hint: [
      ca.sourceType,
      ca.severity,
      ca.ownerUserName,
    ].filter(Boolean).join(' / ') || '情報なし',
    suggestedBuId: null,
    suggestedBuName: null,
  }));

  return { items, totalCount: result.total };
}

// ========== 一括付与 ==========

/**
 * 未分類アイテムに businessUnitId を一括付与
 *
 * 安全装置: 現在 businessUnitId が null のアイテムのみ更新
 */
export function assignBusinessUnit(
  viewer: AdminViewerContext,
  request: UnclassifiedAssignRequest
): { success: true; data: UnclassifiedAssignResponse } | { success: false; error: string } {
  const { entityType, ids, targetBusinessUnitId } = request;

  // 事業単位の存在チェック
  const businessUnit = getBusinessUnitById(targetBusinessUnitId);
  if (!businessUnit) {
    return { success: false, error: '指定された事業単位が存在しません' };
  }

  if (ids.length === 0) {
    return { success: false, error: '対象IDが指定されていません' };
  }

  let affectedCount = 0;
  let skippedCount = 0;

  switch (entityType) {
    case 'tickets':
      for (const id of ids) {
        const ticket = getTicketById(id, ADMIN_VIEWER);
        if (!ticket.success) {
          skippedCount++;
          continue;
        }
        // 安全装置: null以外は更新しない
        if (ticket.ticket.businessUnitId !== null) {
          skippedCount++;
          continue;
        }
        const updateResult = updateTicket(id, { businessUnitId: targetBusinessUnitId }, ADMIN_VIEWER);
        if (updateResult.success) {
          affectedCount++;
        } else {
          skippedCount++;
        }
      }
      break;

    case 'repairs':
      for (const id of ids) {
        const repairResult = getRepairById(id, ADMIN_VIEWER);
        if (!repairResult.success) {
          skippedCount++;
          continue;
        }
        // 安全装置: null以外は更新しない
        if (repairResult.repair.businessUnitId !== null) {
          skippedCount++;
          continue;
        }
        const updateResult = updateRepair(id, { businessUnitId: targetBusinessUnitId }, ADMIN_VIEWER);
        if (updateResult.success) {
          affectedCount++;
        } else {
          skippedCount++;
        }
      }
      break;

    case 'correctiveActions':
      for (const id of ids) {
        const caResult = getCorrectiveActionById(id, ADMIN_VIEWER);
        if (!caResult.success) {
          skippedCount++;
          continue;
        }
        // 安全装置: null以外は更新しない
        if (caResult.item.businessUnitId !== null) {
          skippedCount++;
          continue;
        }
        const updateResult = updateCorrectiveAction(id, { businessUnitId: targetBusinessUnitId }, ADMIN_VIEWER);
        if (updateResult.success) {
          affectedCount++;
        } else {
          skippedCount++;
        }
      }
      break;

    default:
      return { success: false, error: `未対応のエンティティタイプ: ${entityType}` };
  }

  // 監査ログ記録
  const event = recordUnclassifiedAssignEvent(
    viewer,
    entityType,
    ids,
    targetBusinessUnitId,
    affectedCount
  );

  return {
    success: true,
    data: {
      affectedCount,
      skippedCount,
      eventId: event.id,
    },
  };
}
