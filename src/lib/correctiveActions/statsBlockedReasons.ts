/**
 * Ticket 131: blocked理由の集計
 *
 * MBR / WBR に「詰まりの内訳」を載せる土台
 */

import { listCorrectiveActions } from './repo';
import type { ViewerContext, BlockedReasonCode, CorrectiveAction } from './types';
import { BLOCKED_REASON_CONFIG } from './types';

const SYSTEM_VIEWER: ViewerContext = { userId: 'system', role: 'admin' };

export interface BlockedReasonDistribution {
  code: BlockedReasonCode;
  label: string;
  count: number;
}

export interface BlockedReasonsStats {
  totalBlocked: number;
  distribution: BlockedReasonDistribution[];
  topReason: { code: BlockedReasonCode; label: string; count: number } | null;
}

/**
 * 現在ブロック中のタスクの理由コード分布を集計
 */
export function getBlockedReasonsStats(filter?: {
  sourceType?: string;
}): BlockedReasonsStats {
  const { items } = listCorrectiveActions(SYSTEM_VIEWER, {
    status: 'blocked',
    sourceType: filter?.sourceType as CorrectiveAction['sourceType'] | undefined,
    limit: 1000,
  });

  const countByCode = new Map<BlockedReasonCode, number>();

  for (const item of items) {
    const meta = item.meta as Record<string, unknown> | null;
    const code = meta?.blockedReasonCode as BlockedReasonCode | undefined;
    if (code) {
      countByCode.set(code, (countByCode.get(code) ?? 0) + 1);
    }
  }

  const distribution: BlockedReasonDistribution[] = Array.from(countByCode.entries())
    .map(([code, count]) => ({
      code,
      label: BLOCKED_REASON_CONFIG[code]?.label ?? code,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const topReason = distribution.length > 0
    ? { code: distribution[0].code, label: distribution[0].label, count: distribution[0].count }
    : null;

  return {
    totalBlocked: items.length,
    distribution,
    topReason,
  };
}
