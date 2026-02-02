/**
 * Scope Guardrail Type Definitions
 *
 * Implementation Ticket 033: 未分類ガードレールと監視アラート
 */

import type { AppRole } from '@/config/appRoles';

/**
 * Entity types that require businessUnitId scoping
 */
export type ScopedEntityType = 'tickets' | 'repairs' | 'correctiveActions';

/**
 * Viewer context for scope validation
 */
export interface ScopeViewerContext {
  userId: string;
  role: AppRole;
}

/**
 * Guardrail validation result
 */
export interface GuardrailValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Unclassified detection result
 */
export interface UnclassifiedDetectionResult {
  entityType: ScopedEntityType;
  count: number;
  sample: UnclassifiedItem[];
}

/**
 * Unclassified item summary
 */
export interface UnclassifiedItem {
  id: string;
  title: string;
  createdAt: string;
  createdBy: string | null;
}

/**
 * Unclassified counts by entity type
 */
export interface UnclassifiedCounts {
  tickets: number;
  repairs: number;
  correctiveActions: number;
  total: number;
}

/**
 * Alert creation result
 */
export interface UnclassifiedAlertResult {
  created: number;
  skipped: number;
  entityTypes: ScopedEntityType[];
}

/**
 * Roles that require businessUnitId when creating records
 * manager/leader must specify businessUnitId (staff is exempt as they create in own context)
 */
export const GUARDRAIL_ROLES: AppRole[] = ['manager', 'leader'];

/**
 * Check if a role requires businessUnitId guardrail
 */
export function requiresBusinessUnitGuardrail(role: AppRole): boolean {
  return GUARDRAIL_ROLES.includes(role);
}

/**
 * Roles that can see unclassified monitoring alerts
 */
export const UNCLASSIFIED_ALERT_ROLES: AppRole[] = ['admin', 'executive', 'manager'];

/**
 * Check if a role can view unclassified alerts
 */
export function canViewUnclassifiedAlerts(role: AppRole): boolean {
  return UNCLASSIFIED_ALERT_ROLES.includes(role);
}
