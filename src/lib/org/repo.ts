/**
 * 組織ツリー（Org Tree）リポジトリ
 *
 * 組織CRUD、ツリー管理、所属管理、監査ログ
 * 現状は in-memory ストレージ（将来 DB 置換）
 */

import type {
  OrgUnit,
  OrgUnitWithChildren,
  OrgUnitType,
  UserOrgMembership,
  RoleInOrg,
  OrgManager,
  OrgManagerType,
  OrgEvent,
  OrgEventAction,
  OrgEventEntityType,
  UserOrgContext,
  ViewerContext,
  CreateOrgUnitInput,
  UpdateOrgUnitInput,
  AddMemberInput,
  UpdateMembershipInput,
} from './types';
import { canViewOrgTree, canEditOrg, canEditMembership } from './types';

// ========== ストレージ ==========

const orgUnitsStore = new Map<string, OrgUnit>();
const membershipsStore = new Map<string, UserOrgMembership>();
const managersStore = new Map<string, OrgManager>();
const eventsStore: OrgEvent[] = [];

// ========== ユーティリティ ==========

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== 監査ログ ==========

function addEvent(
  entityType: OrgEventEntityType,
  entityId: string,
  actorUserId: string,
  action: OrgEventAction,
  beforeJson: unknown | null,
  afterJson: unknown | null,
  note?: string
): OrgEvent {
  const event: OrgEvent = {
    id: generateId('evt'),
    entityType,
    entityId,
    actorUserId,
    action,
    beforeJson: beforeJson ? JSON.stringify(beforeJson) : null,
    afterJson: afterJson ? JSON.stringify(afterJson) : null,
    note: note ?? null,
    createdAt: now(),
  };
  eventsStore.push(event);
  return event;
}

export function getEvents(
  filters: { entityType?: OrgEventEntityType; entityId?: string; limit?: number } = {}
): OrgEvent[] {
  let events = [...eventsStore];

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

// ========== 組織単位 CRUD ==========

export function getTree(options: { includeInactive?: boolean } = {}): OrgUnitWithChildren[] {
  let units = Array.from(orgUnitsStore.values());

  if (!options.includeInactive) {
    units = units.filter((u) => u.isActive);
  }

  // ルートノードを取得
  const roots = units.filter((u) => u.parentId === null);

  // 再帰的に子を取得
  function buildTree(parent: OrgUnit): OrgUnitWithChildren {
    const children = units
      .filter((u) => u.parentId === parent.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      ...parent,
      children: children.map(buildTree),
    };
  }

  return roots.sort((a, b) => a.sortOrder - b.sortOrder).map(buildTree);
}

export function listOrgUnits(options: { includeInactive?: boolean } = {}): OrgUnit[] {
  let units = Array.from(orgUnitsStore.values());

  if (!options.includeInactive) {
    units = units.filter((u) => u.isActive);
  }

  units.sort((a, b) => a.sortOrder - b.sortOrder);
  return units;
}

export function getOrgUnitById(id: string): OrgUnit | null {
  return orgUnitsStore.get(id) ?? null;
}

export function createOrgUnit(
  input: CreateOrgUnitInput,
  actorUserId: string
): { success: true; unit: OrgUnit } | { success: false; error: string } {
  // 親存在チェック
  if (input.parentId) {
    const parent = orgUnitsStore.get(input.parentId);
    if (!parent) {
      return { success: false, error: '親組織が見つかりません' };
    }
    if (!parent.isActive) {
      return { success: false, error: '無効な親組織には追加できません' };
    }
  }

  const timestamp = now();
  const unit: OrgUnit = {
    id: generateId('org'),
    name: input.name,
    type: input.type,
    parentId: input.parentId ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: true,
    description: input.description ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  orgUnitsStore.set(unit.id, unit);
  addEvent('org_unit', unit.id, actorUserId, 'create', null, unit);

  return { success: true, unit };
}

export function updateOrgUnit(
  id: string,
  patch: UpdateOrgUnitInput,
  actorUserId: string
): { success: true; unit: OrgUnit } | { success: false; error: string } {
  const existing = orgUnitsStore.get(id);
  if (!existing) {
    return { success: false, error: '組織が見つかりません' };
  }

  const timestamp = now();
  const updated: OrgUnit = {
    ...existing,
    ...patch,
    updatedAt: timestamp,
  };

  orgUnitsStore.set(id, updated);
  addEvent('org_unit', id, actorUserId, 'update', existing, updated);

  return { success: true, unit: updated };
}

export function moveOrgUnit(
  id: string,
  newParentId: string | null,
  actorUserId: string
): { success: true; unit: OrgUnit } | { success: false; error: string } {
  const existing = orgUnitsStore.get(id);
  if (!existing) {
    return { success: false, error: '組織が見つかりません' };
  }

  // 新しい親の存在チェック
  if (newParentId) {
    const newParent = orgUnitsStore.get(newParentId);
    if (!newParent) {
      return { success: false, error: '移動先の親組織が見つかりません' };
    }
    if (!newParent.isActive) {
      return { success: false, error: '無効な親組織には移動できません' };
    }

    // 循環チェック（自分自身や子孫には移動できない）
    let current: OrgUnit | null = newParent;
    while (current) {
      if (current.id === id) {
        return { success: false, error: '自分自身または子孫には移動できません' };
      }
      current = current.parentId ? orgUnitsStore.get(current.parentId) ?? null : null;
    }
  }

  const timestamp = now();
  const updated: OrgUnit = {
    ...existing,
    parentId: newParentId,
    updatedAt: timestamp,
  };

  orgUnitsStore.set(id, updated);
  addEvent('org_unit', id, actorUserId, 'move', existing, updated, `親を ${existing.parentId} から ${newParentId} へ移動`);

  return { success: true, unit: updated };
}

export function deactivateOrgUnit(
  id: string,
  actorUserId: string
): { success: true } | { success: false; error: string } {
  const existing = orgUnitsStore.get(id);
  if (!existing) {
    return { success: false, error: '組織が見つかりません' };
  }

  // 子組織があるかチェック
  const hasActiveChildren = Array.from(orgUnitsStore.values()).some(
    (u) => u.parentId === id && u.isActive
  );
  if (hasActiveChildren) {
    return { success: false, error: '有効な子組織がある場合は無効化できません' };
  }

  const timestamp = now();
  const updated: OrgUnit = {
    ...existing,
    isActive: false,
    updatedAt: timestamp,
  };

  orgUnitsStore.set(id, updated);
  addEvent('org_unit', id, actorUserId, 'deactivate', existing, updated);

  return { success: true };
}

export function reactivateOrgUnit(
  id: string,
  actorUserId: string
): { success: true; unit: OrgUnit } | { success: false; error: string } {
  const existing = orgUnitsStore.get(id);
  if (!existing) {
    return { success: false, error: '組織が見つかりません' };
  }

  // 親が無効の場合は再有効化できない
  if (existing.parentId) {
    const parent = orgUnitsStore.get(existing.parentId);
    if (parent && !parent.isActive) {
      return { success: false, error: '親組織が無効の場合は再有効化できません' };
    }
  }

  const timestamp = now();
  const updated: OrgUnit = {
    ...existing,
    isActive: true,
    updatedAt: timestamp,
  };

  orgUnitsStore.set(id, updated);
  addEvent('org_unit', id, actorUserId, 'reactivate', existing, updated);

  return { success: true, unit: updated };
}

// ========== メンバーシップ ==========

export function listMembers(orgUnitId: string): UserOrgMembership[] {
  return Array.from(membershipsStore.values())
    .filter((m) => m.orgUnitId === orgUnitId)
    .sort((a, b) => {
      // isPrimary優先、その後roleInOrg順
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return (a.userName ?? '').localeCompare(b.userName ?? '', 'ja');
    });
}

export function getMembershipById(id: string): UserOrgMembership | null {
  return membershipsStore.get(id) ?? null;
}

export function getUserMemberships(userId: string): UserOrgMembership[] {
  return Array.from(membershipsStore.values())
    .filter((m) => m.userId === userId)
    .map((m) => {
      const org = orgUnitsStore.get(m.orgUnitId);
      return {
        ...m,
        orgUnitName: org?.name ?? null,
      };
    });
}

export function addMember(
  orgUnitId: string,
  input: AddMemberInput,
  actorUserId: string
): { success: true; membership: UserOrgMembership } | { success: false; error: string } {
  const org = orgUnitsStore.get(orgUnitId);
  if (!org) {
    return { success: false, error: '組織が見つかりません' };
  }
  if (!org.isActive) {
    return { success: false, error: '無効な組織にはメンバーを追加できません' };
  }

  // 既に所属していないかチェック
  const existing = Array.from(membershipsStore.values()).find(
    (m) => m.userId === input.userId && m.orgUnitId === orgUnitId
  );
  if (existing) {
    return { success: false, error: 'このユーザーは既にこの組織に所属しています' };
  }

  // isPrimaryの場合、既存のprimaryを解除
  if (input.isPrimary) {
    for (const m of membershipsStore.values()) {
      if (m.userId === input.userId && m.isPrimary) {
        const updated = { ...m, isPrimary: false, updatedAt: now() };
        membershipsStore.set(m.id, updated);
      }
    }
  }

  const timestamp = now();
  const membership: UserOrgMembership = {
    id: generateId('mem'),
    userId: input.userId,
    userName: null,  // 後でUserから取得
    orgUnitId,
    orgUnitName: org.name,
    roleInOrg: input.roleInOrg ?? 'member',
    isPrimary: input.isPrimary ?? false,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  membershipsStore.set(membership.id, membership);
  addEvent('membership', membership.id, actorUserId, 'assign_user', null, membership);

  return { success: true, membership };
}

export function updateMembership(
  id: string,
  patch: UpdateMembershipInput,
  actorUserId: string
): { success: true; membership: UserOrgMembership } | { success: false; error: string } {
  const existing = membershipsStore.get(id);
  if (!existing) {
    return { success: false, error: '所属が見つかりません' };
  }

  // isPrimaryをtrueにする場合、既存のprimaryを解除
  if (patch.isPrimary && !existing.isPrimary) {
    for (const m of membershipsStore.values()) {
      if (m.userId === existing.userId && m.isPrimary && m.id !== id) {
        const updated = { ...m, isPrimary: false, updatedAt: now() };
        membershipsStore.set(m.id, updated);
      }
    }
  }

  const timestamp = now();
  const updated: UserOrgMembership = {
    ...existing,
    ...patch,
    updatedAt: timestamp,
  };

  membershipsStore.set(id, updated);
  addEvent('membership', id, actorUserId, 'update', existing, updated);

  return { success: true, membership: updated };
}

export function removeMember(
  id: string,
  actorUserId: string
): { success: true } | { success: false; error: string } {
  const existing = membershipsStore.get(id);
  if (!existing) {
    return { success: false, error: '所属が見つかりません' };
  }

  membershipsStore.delete(id);
  addEvent('membership', id, actorUserId, 'remove_user', existing, null);

  return { success: true };
}

export function setPrimaryMembership(
  userId: string,
  orgUnitId: string,
  actorUserId: string
): { success: true } | { success: false; error: string } {
  // 対象の所属を探す
  const target = Array.from(membershipsStore.values()).find(
    (m) => m.userId === userId && m.orgUnitId === orgUnitId
  );
  if (!target) {
    return { success: false, error: 'この組織への所属が見つかりません' };
  }

  // 全てのisPrimaryを解除して対象をtrueに
  for (const m of membershipsStore.values()) {
    if (m.userId === userId) {
      const shouldBePrimary = m.id === target.id;
      if (m.isPrimary !== shouldBePrimary) {
        const updated = { ...m, isPrimary: shouldBePrimary, updatedAt: now() };
        membershipsStore.set(m.id, updated);
        if (shouldBePrimary) {
          addEvent('membership', m.id, actorUserId, 'set_primary', m, updated);
        }
      }
    }
  }

  return { success: true };
}

// ========== 組織責任者 ==========

export function listManagers(orgUnitId: string): OrgManager[] {
  return Array.from(managersStore.values())
    .filter((m) => m.orgUnitId === orgUnitId)
    .sort((a, b) => (a.userName ?? '').localeCompare(b.userName ?? '', 'ja'));
}

export function setOrgManager(
  orgUnitId: string,
  userId: string,
  type: OrgManagerType,
  actorUserId: string
): { success: true; manager: OrgManager } | { success: false; error: string } {
  const org = orgUnitsStore.get(orgUnitId);
  if (!org) {
    return { success: false, error: '組織が見つかりません' };
  }

  // 既に登録されていないかチェック
  const existing = Array.from(managersStore.values()).find(
    (m) => m.orgUnitId === orgUnitId && m.userId === userId && m.type === type
  );
  if (existing) {
    return { success: false, error: 'このユーザーは既にこの役割で登録されています' };
  }

  const manager: OrgManager = {
    id: generateId('mgr'),
    orgUnitId,
    userId,
    userName: null,  // 後でUserから取得
    type,
    createdAt: now(),
  };

  managersStore.set(manager.id, manager);
  addEvent('manager', manager.id, actorUserId, 'assign_manager', null, manager);

  return { success: true, manager };
}

export function removeOrgManager(
  orgUnitId: string,
  userId: string,
  type: OrgManagerType,
  actorUserId: string
): { success: true } | { success: false; error: string } {
  const existing = Array.from(managersStore.values()).find(
    (m) => m.orgUnitId === orgUnitId && m.userId === userId && m.type === type
  );
  if (!existing) {
    return { success: false, error: '責任者が見つかりません' };
  }

  managersStore.delete(existing.id);
  addEvent('manager', existing.id, actorUserId, 'remove_manager', existing, null);

  return { success: true };
}

// ========== ユーザー組織コンテキスト ==========

export function getUserOrgContext(userId: string): UserOrgContext {
  const memberships = getUserMemberships(userId);
  const primaryMembership = memberships.find((m) => m.isPrimary);

  const managerEntries = Array.from(managersStore.values()).filter((m) => m.userId === userId);

  return {
    userId,
    primaryOrgUnitId: primaryMembership?.orgUnitId ?? null,
    primaryOrgUnit: primaryMembership?.orgUnitId
      ? orgUnitsStore.get(primaryMembership.orgUnitId) ?? null
      : null,
    orgUnitIds: memberships.map((m) => m.orgUnitId),
    memberships,
    managerOfOrgUnitIds: managerEntries.map((m) => m.orgUnitId),
  };
}

// ========== 統計 ==========

export interface OrgStats {
  totalUnits: number;
  activeUnits: number;
  totalMemberships: number;
  totalManagers: number;
  byType: Record<OrgUnitType, number>;
}

export function getStats(): OrgStats {
  const units = Array.from(orgUnitsStore.values());
  const byType: Record<OrgUnitType, number> = {
    corp: 0,
    business: 0,
    site: 0,
    dept: 0,
    team: 0,
    other: 0,
  };

  for (const unit of units) {
    if (unit.isActive) {
      byType[unit.type] = (byType[unit.type] || 0) + 1;
    }
  }

  return {
    totalUnits: units.length,
    activeUnits: units.filter((u) => u.isActive).length,
    totalMemberships: membershipsStore.size,
    totalManagers: managersStore.size,
    byType,
  };
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (orgUnitsStore.size > 0) return;

  const timestamp = now();

  // 組織階層
  const orgData: Array<Omit<OrgUnit, 'createdAt' | 'updatedAt'>> = [
    // 法人
    {
      id: 'org_corp',
      name: 'AA介護株式会社',
      type: 'corp',
      parentId: null,
      sortOrder: 0,
      isActive: true,
      description: '法人本部',
    },
    // 事業
    {
      id: 'org_homecare',
      name: '訪問介護事業部',
      type: 'business',
      parentId: 'org_corp',
      sortOrder: 0,
      isActive: true,
      description: '訪問介護サービス全般',
    },
    {
      id: 'org_facility',
      name: '施設事業部',
      type: 'business',
      parentId: 'org_corp',
      sortOrder: 1,
      isActive: true,
      description: '入所施設運営',
    },
    // 拠点
    {
      id: 'org_nishi',
      name: '西淀川拠点',
      type: 'site',
      parentId: 'org_homecare',
      sortOrder: 0,
      isActive: true,
      description: '大阪市西淀川区エリア担当',
    },
    {
      id: 'org_higashi',
      name: '東淀川拠点',
      type: 'site',
      parentId: 'org_homecare',
      sortOrder: 1,
      isActive: true,
      description: '大阪市東淀川区エリア担当',
    },
    {
      id: 'org_sakura',
      name: 'サ高住さくら',
      type: 'site',
      parentId: 'org_facility',
      sortOrder: 0,
      isActive: true,
      description: 'サービス付き高齢者向け住宅',
    },
    // チーム
    {
      id: 'org_nishi_a',
      name: '西淀川Aチーム',
      type: 'team',
      parentId: 'org_nishi',
      sortOrder: 0,
      isActive: true,
      description: '日勤チーム',
    },
    {
      id: 'org_nishi_b',
      name: '西淀川Bチーム',
      type: 'team',
      parentId: 'org_nishi',
      sortOrder: 1,
      isActive: true,
      description: '夜勤チーム',
    },
  ];

  for (const data of orgData) {
    orgUnitsStore.set(data.id, {
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  // メンバーシップ
  const memberData: Array<Omit<UserOrgMembership, 'id' | 'createdAt' | 'updatedAt'>> = [
    {
      userId: 'user_executive',
      userName: '佐藤部長',
      orgUnitId: 'org_corp',
      orgUnitName: 'AA介護株式会社',
      roleInOrg: 'executive',
      isPrimary: true,
      startAt: '2020-04-01',
      endAt: null,
    },
    {
      userId: 'user_manager',
      userName: '田中管理者',
      orgUnitId: 'org_nishi',
      orgUnitName: '西淀川拠点',
      roleInOrg: 'manager',
      isPrimary: true,
      startAt: '2021-04-01',
      endAt: null,
    },
    {
      userId: 'user_leader',
      userName: '山田リーダー',
      orgUnitId: 'org_nishi_a',
      orgUnitName: '西淀川Aチーム',
      roleInOrg: 'leader',
      isPrimary: true,
      startAt: '2022-04-01',
      endAt: null,
    },
    {
      userId: 'user_staff',
      userName: '鈴木スタッフ',
      orgUnitId: 'org_nishi_a',
      orgUnitName: '西淀川Aチーム',
      roleInOrg: 'member',
      isPrimary: true,
      startAt: '2023-04-01',
      endAt: null,
    },
    {
      userId: 'user_admin',
      userName: '管理者',
      orgUnitId: 'org_corp',
      orgUnitName: 'AA介護株式会社',
      roleInOrg: 'manager',
      isPrimary: true,
      startAt: '2020-04-01',
      endAt: null,
    },
  ];

  for (const data of memberData) {
    const id = generateId('mem');
    membershipsStore.set(id, {
      ...data,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  // 責任者
  const managerData: Array<Omit<OrgManager, 'id' | 'createdAt'>> = [
    {
      orgUnitId: 'org_corp',
      userId: 'user_executive',
      userName: '佐藤部長',
      type: 'owner',
    },
    {
      orgUnitId: 'org_nishi',
      userId: 'user_manager',
      userName: '田中管理者',
      type: 'manager',
    },
    {
      orgUnitId: 'org_nishi',
      userId: 'user_manager',
      userName: '田中管理者',
      type: 'approver',
    },
  ];

  for (const data of managerData) {
    const id = generateId('mgr');
    managersStore.set(id, {
      ...data,
      id,
      createdAt: timestamp,
    });
  }
}

// 初期化
initDemoData();
