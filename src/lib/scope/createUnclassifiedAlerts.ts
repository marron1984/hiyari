/**
 * Unclassified Scope Alert Creation
 *
 * Implementation Ticket 033: 未分類ガードレールと監視アラート
 * 未分類レコードが検出された場合にアラートを作成する
 */

import type { ScopedEntityType, UnclassifiedCounts, UnclassifiedAlertResult } from './types';
import type { CreateAlertRequest, AlertSeverity } from '@/lib/alerts/types';
import { generateFingerprint } from '@/lib/alerts/types';
import { createAlert, createAlertsFromScan } from '@/lib/alerts/repo';
import { getUnclassifiedCounts, ENTITY_TYPE_LABELS } from './detectUnclassifiedBusinessUnit';

/**
 * Threshold for unclassified count to trigger warning severity
 */
const WARNING_THRESHOLD = 5;

/**
 * Threshold for unclassified count to trigger critical severity
 */
const CRITICAL_THRESHOLD = 20;

/**
 * Determine alert severity based on unclassified count
 */
function determineSeverity(count: number): AlertSeverity {
  if (count >= CRITICAL_THRESHOLD) return 'critical';
  if (count >= WARNING_THRESHOLD) return 'warning';
  return 'info';
}

/**
 * Create alert for a specific entity type with unclassified records
 */
function createAlertRequestForEntityType(
  entityType: ScopedEntityType,
  count: number
): CreateAlertRequest {
  const entityLabel = ENTITY_TYPE_LABELS[entityType];
  const severity = determineSeverity(count);

  return {
    type: 'unclassified_scope',
    sourceId: entityType,
    title: `${entityLabel}に未分類レコードがあります`,
    message: `${entityLabel}で businessUnitId が未設定のレコードが ${count} 件あります。Scope Backfill を使用して事業単位を割り当ててください。`,
    severity,
    fingerprint: generateFingerprint('unclassified_scope', entityType),
    assignedRole: 'admin',
    meta: {
      entityType,
      count,
      detectedAt: new Date().toISOString(),
    },
  };
}

/**
 * Create alerts for all entity types with unclassified records
 *
 * This function should be called periodically (e.g., daily batch or on-demand)
 */
export function createUnclassifiedAlerts(): UnclassifiedAlertResult {
  const counts = getUnclassifiedCounts();
  const alertRequests: CreateAlertRequest[] = [];
  const entityTypes: ScopedEntityType[] = [];

  // Create alert for each entity type with unclassified records
  if (counts.tickets > 0) {
    alertRequests.push(createAlertRequestForEntityType('tickets', counts.tickets));
    entityTypes.push('tickets');
  }
  if (counts.repairs > 0) {
    alertRequests.push(createAlertRequestForEntityType('repairs', counts.repairs));
    entityTypes.push('repairs');
  }
  if (counts.correctiveActions > 0) {
    alertRequests.push(createAlertRequestForEntityType('correctiveActions', counts.correctiveActions));
    entityTypes.push('correctiveActions');
  }

  if (alertRequests.length === 0) {
    return { created: 0, skipped: 0, entityTypes: [] };
  }

  const result = createAlertsFromScan(alertRequests);

  return {
    created: result.created,
    skipped: result.skipped,
    entityTypes,
  };
}

/**
 * Create a single summary alert for all unclassified records
 */
export function createUnclassifiedSummaryAlert(): { alert: ReturnType<typeof createAlert>; counts: UnclassifiedCounts } {
  const counts = getUnclassifiedCounts();

  if (counts.total === 0) {
    return {
      alert: { alert: null as unknown as ReturnType<typeof createAlert>['alert'], isNew: false },
      counts,
    };
  }

  const parts: string[] = [];
  if (counts.tickets > 0) parts.push(`チケット ${counts.tickets}件`);
  if (counts.repairs > 0) parts.push(`修繕 ${counts.repairs}件`);
  if (counts.correctiveActions > 0) parts.push(`是正措置 ${counts.correctiveActions}件`);

  const severity = determineSeverity(counts.total);

  const request: CreateAlertRequest = {
    type: 'unclassified_scope',
    sourceId: 'summary',
    title: `未分類レコード: 計 ${counts.total} 件`,
    message: `businessUnitId が未設定のレコードがあります: ${parts.join('、')}。Scope Backfill を使用して事業単位を割り当ててください。`,
    severity,
    fingerprint: generateFingerprint('unclassified_scope', 'summary'),
    assignedRole: 'admin',
    meta: {
      ...counts,
      detectedAt: new Date().toISOString(),
    },
  };

  return {
    alert: createAlert(request),
    counts,
  };
}

/**
 * Get current unclassified counts (for external access)
 */
export { getUnclassifiedCounts };
