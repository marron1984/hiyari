/**
 * Scope Guardrail Validation
 *
 * Implementation Ticket 033: 未分類ガードレールと監視アラート
 * manager/leader が新規作成時に businessUnitId を必須とする
 */

import type { AppRole } from '@/config/appRoles';
import type { ScopedEntityType, GuardrailValidationResult, ScopeViewerContext } from './types';
import { requiresBusinessUnitGuardrail } from './types';

/**
 * Entity type display names (Japanese)
 */
const ENTITY_TYPE_LABELS: Record<ScopedEntityType, string> = {
  tickets: 'チケット',
  repairs: '修繕',
  correctiveActions: '是正措置',
};

/**
 * Validate that businessUnitId is provided for roles that require it
 *
 * @param viewer - The user creating the record
 * @param entityType - Type of entity being created
 * @param businessUnitId - The businessUnitId being assigned (null/undefined = unclassified)
 * @returns Validation result with error message if invalid
 */
export function validateBusinessUnitGuardrail(
  viewer: ScopeViewerContext,
  entityType: ScopedEntityType,
  businessUnitId: string | null | undefined
): GuardrailValidationResult {
  // Only check for roles that require guardrail
  if (!requiresBusinessUnitGuardrail(viewer.role)) {
    return { valid: true };
  }

  // businessUnitId must be provided and not empty
  if (!businessUnitId) {
    const entityLabel = ENTITY_TYPE_LABELS[entityType];
    return {
      valid: false,
      error: `${entityLabel}を作成するには事業単位の選択が必須です`,
    };
  }

  return { valid: true };
}

/**
 * Check if role can create without businessUnitId
 * (admin/executive can create unclassified for flexibility, staff creates in own context)
 */
export function canCreateUnclassified(role: AppRole): boolean {
  // admin/executive: 柔軟性のために許可（ただし通常は選択を推奨）
  // staff: 自部署コンテキストで作成（後からmanagerが分類）
  // auditor: 作成権限なし
  return ['admin', 'executive', 'staff'].includes(role);
}

/**
 * Get guardrail error message for a specific entity type
 */
export function getGuardrailErrorMessage(entityType: ScopedEntityType): string {
  const entityLabel = ENTITY_TYPE_LABELS[entityType];
  return `${entityLabel}を作成するには事業単位の選択が必須です。管理職・リーダーは自部署の事業単位を選択してください。`;
}

/**
 * Validate guardrail for API request body
 * Utility function for use in API routes
 */
export function validateApiGuardrail(
  role: AppRole,
  entityType: ScopedEntityType,
  body: { businessUnitId?: string | null }
): { valid: true } | { valid: false; error: string; status: 400 } {
  const viewer: ScopeViewerContext = { userId: '', role };

  const result = validateBusinessUnitGuardrail(viewer, entityType, body.businessUnitId);

  if (!result.valid) {
    return {
      valid: false,
      error: result.error!,
      status: 400,
    };
  }

  return { valid: true };
}
