/**
 * Unclassified BusinessUnit Detection
 *
 * Implementation Ticket 033: 未分類ガードレールと監視アラート
 * businessUnitId が null のレコードを検知する
 */

import type {
  ScopedEntityType,
  UnclassifiedDetectionResult,
  UnclassifiedCounts,
  UnclassifiedItem,
} from './types';

// Import entity repositories
import { listTickets } from '@/lib/tickets/repo';
import { listRepairs } from '@/lib/repairs/repo';
import { listCorrectiveActions } from '@/lib/correctiveActions/repo';

// Admin viewer for full access
const ADMIN_VIEWER = { userId: 'system', role: 'admin' as const };

/**
 * Detect unclassified tickets (businessUnitId = null)
 */
export function detectUnclassifiedTickets(limit: number = 10): UnclassifiedDetectionResult {
  const result = listTickets({ businessUnitId: null }, ADMIN_VIEWER);

  const unclassified = result.items.filter((t) => t.businessUnitId === null);
  const sample: UnclassifiedItem[] = unclassified.slice(0, limit).map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.createdAt,
    createdBy: t.requesterUserId,
  }));

  return {
    entityType: 'tickets',
    count: unclassified.length,
    sample,
  };
}

/**
 * Detect unclassified repairs (businessUnitId = null)
 */
export function detectUnclassifiedRepairs(limit: number = 10): UnclassifiedDetectionResult {
  const result = listRepairs(ADMIN_VIEWER, { businessUnitId: null });

  const unclassified = result.repairs.filter((r) => r.businessUnitId === null);
  const sample: UnclassifiedItem[] = unclassified.slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    createdBy: r.reportedByUserId,
  }));

  return {
    entityType: 'repairs',
    count: unclassified.length,
    sample,
  };
}

/**
 * Detect unclassified correctiveActions (businessUnitId = null)
 */
export function detectUnclassifiedCorrectiveActions(limit: number = 10): UnclassifiedDetectionResult {
  const result = listCorrectiveActions(ADMIN_VIEWER, { businessUnitId: null });

  const unclassified = result.items.filter((ca) => ca.businessUnitId === null);
  const sample: UnclassifiedItem[] = unclassified.slice(0, limit).map((ca) => ({
    id: ca.id,
    title: ca.title,
    createdAt: ca.createdAt,
    createdBy: ca.createdByUserId,
  }));

  return {
    entityType: 'correctiveActions',
    count: unclassified.length,
    sample,
  };
}

/**
 * Detect all unclassified records across all entity types
 */
export function detectAllUnclassified(sampleLimit: number = 5): {
  results: UnclassifiedDetectionResult[];
  counts: UnclassifiedCounts;
} {
  const ticketsResult = detectUnclassifiedTickets(sampleLimit);
  const repairsResult = detectUnclassifiedRepairs(sampleLimit);
  const correctiveActionsResult = detectUnclassifiedCorrectiveActions(sampleLimit);

  const counts: UnclassifiedCounts = {
    tickets: ticketsResult.count,
    repairs: repairsResult.count,
    correctiveActions: correctiveActionsResult.count,
    total: ticketsResult.count + repairsResult.count + correctiveActionsResult.count,
  };

  return {
    results: [ticketsResult, repairsResult, correctiveActionsResult],
    counts,
  };
}

/**
 * Get unclassified counts only (lightweight check)
 */
export function getUnclassifiedCounts(): UnclassifiedCounts {
  const ticketsResult = detectUnclassifiedTickets(0);
  const repairsResult = detectUnclassifiedRepairs(0);
  const correctiveActionsResult = detectUnclassifiedCorrectiveActions(0);

  return {
    tickets: ticketsResult.count,
    repairs: repairsResult.count,
    correctiveActions: correctiveActionsResult.count,
    total: ticketsResult.count + repairsResult.count + correctiveActionsResult.count,
  };
}

/**
 * Check if there are any unclassified records
 */
export function hasUnclassifiedRecords(): boolean {
  const counts = getUnclassifiedCounts();
  return counts.total > 0;
}

/**
 * Entity type labels for display
 */
export const ENTITY_TYPE_LABELS: Record<ScopedEntityType, string> = {
  tickets: 'チケット',
  repairs: '修繕',
  correctiveActions: '是正措置',
};

/**
 * Get detection summary message
 */
export function getDetectionSummaryMessage(counts: UnclassifiedCounts): string {
  const parts: string[] = [];

  if (counts.tickets > 0) {
    parts.push(`チケット ${counts.tickets}件`);
  }
  if (counts.repairs > 0) {
    parts.push(`修繕 ${counts.repairs}件`);
  }
  if (counts.correctiveActions > 0) {
    parts.push(`是正措置 ${counts.correctiveActions}件`);
  }

  if (parts.length === 0) {
    return '未分類レコードはありません';
  }

  return `未分類レコード: ${parts.join('、')}（計 ${counts.total}件）`;
}
