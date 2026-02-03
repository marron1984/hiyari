/**
 * 担当者自動割当サービス（Task 057）
 *
 * - businessUnitId と org-tree に基づいて担当者を自動決定
 * - 冪等（既にassigneeがあれば上書きしない）
 * - 監査ログ対応
 */

import { getBusinessUnitById } from '@/lib/business/repo';
import {
  listManagers,
  listMembers,
  getOrgUnitById,
  getUserMemberships,
} from '@/lib/org/repo';
import type { OrgManager, OrgUnit, UserOrgMembership } from '@/lib/org/types';
import type { TicketCategory, TicketPriority } from '@/lib/tickets/types';

// ========== 型定義 ==========

/**
 * 対象エンティティ種別
 */
export type AssignEntityType = 'ticket' | 'repair' | 'correctiveAction' | 'complaint';

/**
 * 割当結果
 */
export type AssignResult =
  | { ok: true; assigneeUserId: string; reason: string }
  | { ok: false; reason: string };

/**
 * 割当リクエスト
 */
export interface AutoAssignRequest {
  entityType: AssignEntityType;
  businessUnitId: string | null;
  category?: TicketCategory | string | null;
  priority?: TicketPriority | string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical' | null;
  createdByUserId?: string | null;
  location?: string | null;
}

/**
 * 割当イベント（監査ログ用）
 */
export interface AssignmentEvent {
  id: string;
  entityType: AssignEntityType;
  entityId: string;
  assigneeUserId: string | null;
  reason: string;
  isAutoAssign: boolean;
  createdAt: string;
  createdByUserId: string | null;
}

// ========== イベントストア ==========

const assignmentEventsStore: AssignmentEvent[] = [];
let eventIdCounter = 1;

function generateEventId(): string {
  return `assign_evt_${Date.now()}_${eventIdCounter++}`;
}

/**
 * 割当イベントを記録
 */
export function recordAssignmentEvent(
  entityType: AssignEntityType,
  entityId: string,
  assigneeUserId: string | null,
  reason: string,
  isAutoAssign: boolean,
  createdByUserId: string | null
): AssignmentEvent {
  const event: AssignmentEvent = {
    id: generateEventId(),
    entityType,
    entityId,
    assigneeUserId,
    reason,
    isAutoAssign,
    createdAt: new Date().toISOString(),
    createdByUserId,
  };
  assignmentEventsStore.push(event);
  return event;
}

/**
 * 割当イベント履歴を取得
 */
export function getAssignmentEvents(
  filters: {
    entityType?: AssignEntityType;
    entityId?: string;
    limit?: number;
  } = {}
): AssignmentEvent[] {
  let events = [...assignmentEventsStore];

  if (filters.entityType) {
    events = events.filter((e) => e.entityType === filters.entityType);
  }
  if (filters.entityId) {
    events = events.filter((e) => e.entityId === filters.entityId);
  }

  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (filters.limit) {
    events = events.slice(0, filters.limit);
  }

  return events;
}

// ========== カテゴリ別専門担当マッピング ==========

/**
 * カテゴリごとの優先対象ロール
 */
const CATEGORY_PREFERRED_ROLES: Record<string, string[]> = {
  facility: ['facility_manager', 'manager'],
  it: ['it_admin', 'admin'],
  finance: ['accountant', 'executive'],
  hr: ['hr_manager', 'manager'],
  client: ['leader', 'manager'],
  compliance: ['admin', 'executive'],
  ops: ['manager', 'leader'],
  general: ['leader', 'manager'],
};

/**
 * エンティティ種別ごとのデフォルトカテゴリ
 */
const ENTITY_DEFAULT_CATEGORY: Record<AssignEntityType, string> = {
  ticket: 'general',
  repair: 'facility',
  correctiveAction: 'compliance',
  complaint: 'client',
};

// ========== 割当ロジック ==========

/**
 * Step 1: business_units.ownerUserId から取得
 */
function findByBusinessUnitOwner(businessUnitId: string | null): string | null {
  if (!businessUnitId) return null;

  const businessUnit = getBusinessUnitById(businessUnitId);
  if (!businessUnit || !businessUnit.ownerUserId) return null;

  return businessUnit.ownerUserId;
}

/**
 * Step 2: org_managers から type='manager' を探す
 */
function findByOrgManager(businessUnitId: string | null): string | null {
  if (!businessUnitId) return null;

  const businessUnit = getBusinessUnitById(businessUnitId);
  if (!businessUnit || !businessUnit.orgUnitId) return null;

  const orgUnit = getOrgUnitById(businessUnit.orgUnitId);
  if (!orgUnit || !orgUnit.isActive) return null;

  // このorgUnitのmanagerを探す
  const managers = listManagers(businessUnit.orgUnitId);
  const managerEntry = managers.find((m) => m.type === 'manager');
  if (managerEntry) {
    return managerEntry.userId;
  }

  // 見つからなければ親組織を辿る
  if (orgUnit.parentId) {
    const parentManagers = listManagers(orgUnit.parentId);
    const parentManager = parentManagers.find((m) => m.type === 'manager');
    if (parentManager) {
      return parentManager.userId;
    }
  }

  return null;
}

/**
 * Step 3: orgUnitに所属するmanager roleのユーザーを探す
 */
function findByOrgMembership(businessUnitId: string | null): string | null {
  if (!businessUnitId) return null;

  const businessUnit = getBusinessUnitById(businessUnitId);
  if (!businessUnit || !businessUnit.orgUnitId) return null;

  const members = listMembers(businessUnit.orgUnitId);
  const managerMember = members.find((m) => m.roleInOrg === 'manager');
  if (managerMember) {
    return managerMember.userId;
  }

  // リーダーで妥協
  const leaderMember = members.find((m) => m.roleInOrg === 'leader');
  if (leaderMember) {
    return leaderMember.userId;
  }

  return null;
}

/**
 * Step 4: 作成者の上位マネージャーを探す
 */
function findByCreatorManager(createdByUserId: string | null): string | null {
  if (!createdByUserId) return null;

  const memberships = getUserMemberships(createdByUserId);
  if (memberships.length === 0) return null;

  // primary所属のorgUnitのmanagerを探す
  const primaryMembership = memberships.find((m) => m.isPrimary);
  const targetOrgUnitId = primaryMembership?.orgUnitId ?? memberships[0].orgUnitId;

  const managers = listManagers(targetOrgUnitId);
  const managerEntry = managers.find((m) => m.type === 'manager' || m.type === 'approver');
  if (managerEntry && managerEntry.userId !== createdByUserId) {
    return managerEntry.userId;
  }

  // orgUnitの親を辿る
  const orgUnit = getOrgUnitById(targetOrgUnitId);
  if (orgUnit?.parentId) {
    const parentManagers = listManagers(orgUnit.parentId);
    const parentManager = parentManagers.find((m) => m.type === 'manager');
    if (parentManager && parentManager.userId !== createdByUserId) {
      return parentManager.userId;
    }
  }

  return null;
}

// ========== メイン関数 ==========

/**
 * 担当者を自動割当
 *
 * 優先順位：
 * 1. business_units.ownerUserId（あれば最優先）
 * 2. org_managers(orgUnitId, type='manager') の userId
 * 3. orgUnitに所属する roleInOrg='manager' のユーザー
 * 4. 作成者の上位マネージャー
 * 5. 見つからない場合は未割当
 */
export function autoAssign(request: AutoAssignRequest): AssignResult {
  const { businessUnitId, createdByUserId } = request;

  // Step 1: business_units.ownerUserId
  const ownerUserId = findByBusinessUnitOwner(businessUnitId);
  if (ownerUserId) {
    return {
      ok: true,
      assigneeUserId: ownerUserId,
      reason: `事業オーナー (businessUnit.ownerUserId)`,
    };
  }

  // Step 2: org_managers
  const orgManagerUserId = findByOrgManager(businessUnitId);
  if (orgManagerUserId) {
    return {
      ok: true,
      assigneeUserId: orgManagerUserId,
      reason: `組織管理者 (org_managers.type=manager)`,
    };
  }

  // Step 3: orgUnit membership
  const memberManagerUserId = findByOrgMembership(businessUnitId);
  if (memberManagerUserId) {
    return {
      ok: true,
      assigneeUserId: memberManagerUserId,
      reason: `組織所属マネージャー/リーダー (org_memberships.roleInOrg)`,
    };
  }

  // Step 4: 作成者の上位マネージャー
  const creatorManagerUserId = findByCreatorManager(createdByUserId ?? null);
  if (creatorManagerUserId) {
    return {
      ok: true,
      assigneeUserId: creatorManagerUserId,
      reason: `作成者の上位マネージャー`,
    };
  }

  // 見つからない
  return {
    ok: false,
    reason: businessUnitId
      ? `事業単位 ${businessUnitId} に担当者が設定されていません`
      : `担当者を特定できませんでした（事業単位未設定）`,
  };
}

/**
 * エンティティ作成時の自動割当ラッパー
 *
 * - 既にassigneeがある場合は何もしない（冪等性）
 * - 監査ログを記録
 */
export function tryAutoAssign(
  request: AutoAssignRequest & { entityId: string; currentAssigneeUserId?: string | null }
): AssignResult & { wasAssigned: boolean } {
  const { entityId, entityType, currentAssigneeUserId, createdByUserId } = request;

  // 冪等性: 既に担当者がいれば何もしない
  if (currentAssigneeUserId) {
    return {
      ok: true,
      assigneeUserId: currentAssigneeUserId,
      reason: '既に担当者が割り当てられています',
      wasAssigned: false,
    };
  }

  // 自動割当実行
  const result = autoAssign(request);

  // 監査ログ記録
  recordAssignmentEvent(
    entityType,
    entityId,
    result.ok ? result.assigneeUserId : null,
    result.reason,
    true,
    createdByUserId ?? null
  );

  if (result.ok) {
    return {
      ...result,
      wasAssigned: true,
    };
  }

  return {
    ...result,
    wasAssigned: false,
  };
}

// ========== 未割当キュー ==========

/**
 * 未割当エンティティ情報
 */
export interface UnassignedEntity {
  entityType: AssignEntityType;
  entityId: string;
  businessUnitId: string | null;
  reason: string;
  createdAt: string;
  createdByUserId: string | null;
}

const unassignedQueueStore: UnassignedEntity[] = [];

/**
 * 未割当キューに追加
 */
export function addToUnassignedQueue(
  entityType: AssignEntityType,
  entityId: string,
  businessUnitId: string | null,
  reason: string,
  createdByUserId: string | null
): void {
  // 重複チェック
  const existing = unassignedQueueStore.find(
    (e) => e.entityType === entityType && e.entityId === entityId
  );
  if (existing) return;

  unassignedQueueStore.push({
    entityType,
    entityId,
    businessUnitId,
    reason,
    createdAt: new Date().toISOString(),
    createdByUserId,
  });
}

/**
 * 未割当キューから削除（割当完了時）
 */
export function removeFromUnassignedQueue(
  entityType: AssignEntityType,
  entityId: string
): void {
  const index = unassignedQueueStore.findIndex(
    (e) => e.entityType === entityType && e.entityId === entityId
  );
  if (index !== -1) {
    unassignedQueueStore.splice(index, 1);
  }
}

/**
 * 未割当キューを取得
 */
export function getUnassignedQueue(
  filters: { entityType?: AssignEntityType; limit?: number } = {}
): UnassignedEntity[] {
  let items = [...unassignedQueueStore];

  if (filters.entityType) {
    items = items.filter((e) => e.entityType === filters.entityType);
  }

  items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (filters.limit) {
    items = items.slice(0, filters.limit);
  }

  return items;
}

/**
 * 未割当キューの統計
 */
export interface UnassignedQueueStats {
  total: number;
  byEntityType: Record<AssignEntityType, number>;
  byBusinessUnit: Record<string, number>;
  oldestCreatedAt: string | null;
}

export function getUnassignedQueueStats(): UnassignedQueueStats {
  const stats: UnassignedQueueStats = {
    total: unassignedQueueStore.length,
    byEntityType: {
      ticket: 0,
      repair: 0,
      correctiveAction: 0,
      complaint: 0,
    },
    byBusinessUnit: {},
    oldestCreatedAt: null,
  };

  for (const item of unassignedQueueStore) {
    stats.byEntityType[item.entityType]++;
    const buKey = item.businessUnitId ?? 'unclassified';
    stats.byBusinessUnit[buKey] = (stats.byBusinessUnit[buKey] ?? 0) + 1;

    if (!stats.oldestCreatedAt || item.createdAt < stats.oldestCreatedAt) {
      stats.oldestCreatedAt = item.createdAt;
    }
  }

  return stats;
}

// ========== ユーティリティ ==========

/**
 * businessUnitIdから推奨担当者リストを取得（UI表示用）
 */
export function getSuggestedAssignees(
  businessUnitId: string | null,
  limit: number = 5
): Array<{ userId: string; userName: string | null; reason: string }> {
  const suggestions: Array<{ userId: string; userName: string | null; reason: string }> = [];
  const seenUserIds = new Set<string>();

  // Step 1: business owner
  if (businessUnitId) {
    const businessUnit = getBusinessUnitById(businessUnitId);
    if (businessUnit?.ownerUserId && !seenUserIds.has(businessUnit.ownerUserId)) {
      suggestions.push({
        userId: businessUnit.ownerUserId,
        userName: businessUnit.ownerName,
        reason: '事業オーナー',
      });
      seenUserIds.add(businessUnit.ownerUserId);
    }

    // Step 2: org managers
    if (businessUnit?.orgUnitId) {
      const managers = listManagers(businessUnit.orgUnitId);
      for (const mgr of managers) {
        if (!seenUserIds.has(mgr.userId) && suggestions.length < limit) {
          suggestions.push({
            userId: mgr.userId,
            userName: mgr.userName,
            reason: `組織管理者 (${mgr.type})`,
          });
          seenUserIds.add(mgr.userId);
        }
      }

      // Step 3: org members with manager/leader role
      const members = listMembers(businessUnit.orgUnitId);
      for (const mem of members) {
        if (
          ['manager', 'leader'].includes(mem.roleInOrg) &&
          !seenUserIds.has(mem.userId) &&
          suggestions.length < limit
        ) {
          suggestions.push({
            userId: mem.userId,
            userName: mem.userName,
            reason: `組織メンバー (${mem.roleInOrg})`,
          });
          seenUserIds.add(mem.userId);
        }
      }
    }
  }

  return suggestions.slice(0, limit);
}
