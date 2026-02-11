/**
 * 組織ツリー（Org Tree）リポジトリ - Firestore実装
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション:
 * - org_units: 組織単位
 * - org_memberships: ユーザー所属
 * - org_managers: 組織責任者
 * - org_events: 組織監査ログ
 */

import { getAdminDb } from '@/lib/firebase-admin';
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

// ========== 定数 ==========

const ORG_UNITS_COLLECTION = 'org_units';
const MEMBERSHIPS_COLLECTION = 'org_memberships';
const MANAGERS_COLLECTION = 'org_managers';
const EVENTS_COLLECTION = 'org_events';

// ========== ユーティリティ ==========

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== ドキュメント変換 ==========

function docToOrgUnit(doc: FirebaseFirestore.DocumentSnapshot): OrgUnit | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    name: data.name ?? '',
    type: data.type ?? 'other',
    parentId: data.parentId ?? null,
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive ?? true,
    description: data.description ?? null,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToMembership(doc: FirebaseFirestore.DocumentSnapshot): UserOrgMembership | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    userId: data.userId ?? '',
    userName: data.userName ?? null,
    orgUnitId: data.orgUnitId ?? '',
    orgUnitName: data.orgUnitName ?? null,
    roleInOrg: data.roleInOrg ?? 'member',
    isPrimary: data.isPrimary ?? false,
    startAt: data.startAt ?? null,
    endAt: data.endAt ?? null,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToManager(doc: FirebaseFirestore.DocumentSnapshot): OrgManager | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    orgUnitId: data.orgUnitId ?? '',
    userId: data.userId ?? '',
    userName: data.userName ?? null,
    type: data.type ?? 'manager',
    createdAt: data.createdAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): OrgEvent | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    entityType: data.entityType ?? 'org_unit',
    entityId: data.entityId ?? '',
    actorUserId: data.actorUserId ?? '',
    action: data.action ?? 'create',
    beforeJson: data.beforeJson ?? null,
    afterJson: data.afterJson ?? null,
    note: data.note ?? null,
    createdAt: data.createdAt ?? now(),
  };
}

// ========== 監査ログ ==========

async function addEvent(
  entityType: OrgEventEntityType,
  entityId: string,
  actorUserId: string,
  action: OrgEventAction,
  beforeJson: unknown | null,
  afterJson: unknown | null,
  note?: string
): Promise<OrgEvent> {
  const db = getAdminDb();
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
  await db.collection(EVENTS_COLLECTION).doc(event.id).set(event);
  return event;
}

export async function getEvents(
  filters: { entityType?: OrgEventEntityType; entityId?: string; limit?: number } = {}
): Promise<OrgEvent[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db
    .collection(EVENTS_COLLECTION)
    .orderBy('createdAt', 'desc');

  if (filters.entityType) {
    query = db
      .collection(EVENTS_COLLECTION)
      .where('entityType', '==', filters.entityType)
      .orderBy('createdAt', 'desc');
  }

  const snap = await query.get();
  let events = snap.docs.map((doc) => docToEvent(doc)!);

  if (filters.entityId) {
    events = events.filter((e) => e.entityId === filters.entityId);
  }

  if (filters.limit) {
    events = events.slice(0, filters.limit);
  }

  return events;
}

// ========== 組織単位 CRUD ==========

export async function getTree(options: { includeInactive?: boolean } = {}): Promise<OrgUnitWithChildren[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(ORG_UNITS_COLLECTION);

  if (!options.includeInactive) {
    query = query.where('isActive', '==', true);
  }

  const snap = await query.get();
  const units = snap.docs.map((doc) => docToOrgUnit(doc)!);

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

export async function listOrgUnits(options: { includeInactive?: boolean } = {}): Promise<OrgUnit[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(ORG_UNITS_COLLECTION);

  if (!options.includeInactive) {
    query = query.where('isActive', '==', true);
  }

  const snap = await query.get();
  const units = snap.docs.map((doc) => docToOrgUnit(doc)!);
  units.sort((a, b) => a.sortOrder - b.sortOrder);
  return units;
}

export async function getOrgUnitById(id: string): Promise<OrgUnit | null> {
  const db = getAdminDb();
  const doc = await db.collection(ORG_UNITS_COLLECTION).doc(id).get();
  return docToOrgUnit(doc);
}

export async function createOrgUnit(
  input: CreateOrgUnitInput,
  actorUserId: string
): Promise<{ success: true; unit: OrgUnit } | { success: false; error: string }> {
  const db = getAdminDb();

  // 親存在チェック
  if (input.parentId) {
    const parentDoc = await db.collection(ORG_UNITS_COLLECTION).doc(input.parentId).get();
    const parent = docToOrgUnit(parentDoc);
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

  await db.collection(ORG_UNITS_COLLECTION).doc(unit.id).set(unit);
  await addEvent('org_unit', unit.id, actorUserId, 'create', null, unit);

  return { success: true, unit };
}

export async function updateOrgUnit(
  id: string,
  patch: UpdateOrgUnitInput,
  actorUserId: string
): Promise<{ success: true; unit: OrgUnit } | { success: false; error: string }> {
  const db = getAdminDb();
  const docRef = db.collection(ORG_UNITS_COLLECTION).doc(id);
  const doc = await docRef.get();
  const existing = docToOrgUnit(doc);
  if (!existing) {
    return { success: false, error: '組織が見つかりません' };
  }

  const timestamp = now();
  const updated: OrgUnit = {
    ...existing,
    ...patch,
    updatedAt: timestamp,
  };

  await docRef.set(updated);
  await addEvent('org_unit', id, actorUserId, 'update', existing, updated);

  return { success: true, unit: updated };
}

export async function moveOrgUnit(
  id: string,
  newParentId: string | null,
  actorUserId: string
): Promise<{ success: true; unit: OrgUnit } | { success: false; error: string }> {
  const db = getAdminDb();
  const docRef = db.collection(ORG_UNITS_COLLECTION).doc(id);
  const doc = await docRef.get();
  const existing = docToOrgUnit(doc);
  if (!existing) {
    return { success: false, error: '組織が見つかりません' };
  }

  // 新しい親の存在チェック
  if (newParentId) {
    const newParentDoc = await db.collection(ORG_UNITS_COLLECTION).doc(newParentId).get();
    const newParent = docToOrgUnit(newParentDoc);
    if (!newParent) {
      return { success: false, error: '移動先の親組織が見つかりません' };
    }
    if (!newParent.isActive) {
      return { success: false, error: '無効な親組織には移動できません' };
    }

    // 循環チェック（自分自身や子孫には移動できない）
    let currentId: string | null = newParentId;
    while (currentId) {
      if (currentId === id) {
        return { success: false, error: '自分自身または子孫には移動できません' };
      }
      const currentDoc = await db.collection(ORG_UNITS_COLLECTION).doc(currentId).get();
      const current = docToOrgUnit(currentDoc);
      currentId = current?.parentId ?? null;
    }
  }

  const timestamp = now();
  const updated: OrgUnit = {
    ...existing,
    parentId: newParentId,
    updatedAt: timestamp,
  };

  await docRef.set(updated);
  await addEvent('org_unit', id, actorUserId, 'move', existing, updated, `親を ${existing.parentId} から ${newParentId} へ移動`);

  return { success: true, unit: updated };
}

export async function deactivateOrgUnit(
  id: string,
  actorUserId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const db = getAdminDb();
  const docRef = db.collection(ORG_UNITS_COLLECTION).doc(id);
  const doc = await docRef.get();
  const existing = docToOrgUnit(doc);
  if (!existing) {
    return { success: false, error: '組織が見つかりません' };
  }

  // 子組織があるかチェック
  const childrenSnap = await db
    .collection(ORG_UNITS_COLLECTION)
    .where('parentId', '==', id)
    .where('isActive', '==', true)
    .get();
  if (!childrenSnap.empty) {
    return { success: false, error: '有効な子組織がある場合は無効化できません' };
  }

  const timestamp = now();
  const updated: OrgUnit = {
    ...existing,
    isActive: false,
    updatedAt: timestamp,
  };

  await docRef.set(updated);
  await addEvent('org_unit', id, actorUserId, 'deactivate', existing, updated);

  return { success: true };
}

export async function reactivateOrgUnit(
  id: string,
  actorUserId: string
): Promise<{ success: true; unit: OrgUnit } | { success: false; error: string }> {
  const db = getAdminDb();
  const docRef = db.collection(ORG_UNITS_COLLECTION).doc(id);
  const doc = await docRef.get();
  const existing = docToOrgUnit(doc);
  if (!existing) {
    return { success: false, error: '組織が見つかりません' };
  }

  // 親が無効の場合は再有効化できない
  if (existing.parentId) {
    const parentDoc = await db.collection(ORG_UNITS_COLLECTION).doc(existing.parentId).get();
    const parent = docToOrgUnit(parentDoc);
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

  await docRef.set(updated);
  await addEvent('org_unit', id, actorUserId, 'reactivate', existing, updated);

  return { success: true, unit: updated };
}

// ========== メンバーシップ ==========

export async function listMembers(orgUnitId: string): Promise<UserOrgMembership[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(MEMBERSHIPS_COLLECTION)
    .where('orgUnitId', '==', orgUnitId)
    .get();

  const members = snap.docs.map((doc) => docToMembership(doc)!);
  return members.sort((a, b) => {
    // isPrimary優先、その後userName順
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return (a.userName ?? '').localeCompare(b.userName ?? '', 'ja');
  });
}

export async function getMembershipById(id: string): Promise<UserOrgMembership | null> {
  const db = getAdminDb();
  const doc = await db.collection(MEMBERSHIPS_COLLECTION).doc(id).get();
  return docToMembership(doc);
}

export async function getUserMemberships(userId: string): Promise<UserOrgMembership[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(MEMBERSHIPS_COLLECTION)
    .where('userId', '==', userId)
    .get();

  const memberships = snap.docs.map((doc) => docToMembership(doc)!);

  // 組織名を付与
  for (const m of memberships) {
    const orgDoc = await db.collection(ORG_UNITS_COLLECTION).doc(m.orgUnitId).get();
    const org = docToOrgUnit(orgDoc);
    if (org) {
      m.orgUnitName = org.name;
    }
  }

  return memberships;
}

export async function addMember(
  orgUnitId: string,
  input: AddMemberInput,
  actorUserId: string
): Promise<{ success: true; membership: UserOrgMembership } | { success: false; error: string }> {
  const db = getAdminDb();

  const orgDoc = await db.collection(ORG_UNITS_COLLECTION).doc(orgUnitId).get();
  const org = docToOrgUnit(orgDoc);
  if (!org) {
    return { success: false, error: '組織が見つかりません' };
  }
  if (!org.isActive) {
    return { success: false, error: '無効な組織にはメンバーを追加できません' };
  }

  // 既に所属していないかチェック
  const existingSnap = await db
    .collection(MEMBERSHIPS_COLLECTION)
    .where('userId', '==', input.userId)
    .where('orgUnitId', '==', orgUnitId)
    .get();
  if (!existingSnap.empty) {
    return { success: false, error: 'このユーザーは既にこの組織に所属しています' };
  }

  // isPrimaryの場合、既存のprimaryを解除
  if (input.isPrimary) {
    const primarySnap = await db
      .collection(MEMBERSHIPS_COLLECTION)
      .where('userId', '==', input.userId)
      .where('isPrimary', '==', true)
      .get();
    const batch = db.batch();
    for (const doc of primarySnap.docs) {
      batch.update(doc.ref, { isPrimary: false, updatedAt: now() });
    }
    await batch.commit();
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

  await db.collection(MEMBERSHIPS_COLLECTION).doc(membership.id).set(membership);
  await addEvent('membership', membership.id, actorUserId, 'assign_user', null, membership);

  return { success: true, membership };
}

export async function updateMembership(
  id: string,
  patch: UpdateMembershipInput,
  actorUserId: string
): Promise<{ success: true; membership: UserOrgMembership } | { success: false; error: string }> {
  const db = getAdminDb();
  const docRef = db.collection(MEMBERSHIPS_COLLECTION).doc(id);
  const doc = await docRef.get();
  const existing = docToMembership(doc);
  if (!existing) {
    return { success: false, error: '所属が見つかりません' };
  }

  // isPrimaryをtrueにする場合、既存のprimaryを解除
  if (patch.isPrimary && !existing.isPrimary) {
    const primarySnap = await db
      .collection(MEMBERSHIPS_COLLECTION)
      .where('userId', '==', existing.userId)
      .where('isPrimary', '==', true)
      .get();
    const batch = db.batch();
    for (const d of primarySnap.docs) {
      if (d.id !== id) {
        batch.update(d.ref, { isPrimary: false, updatedAt: now() });
      }
    }
    await batch.commit();
  }

  const timestamp = now();
  const updated: UserOrgMembership = {
    ...existing,
    ...patch,
    updatedAt: timestamp,
  };

  await docRef.set(updated);
  await addEvent('membership', id, actorUserId, 'update', existing, updated);

  return { success: true, membership: updated };
}

export async function removeMember(
  id: string,
  actorUserId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const db = getAdminDb();
  const docRef = db.collection(MEMBERSHIPS_COLLECTION).doc(id);
  const doc = await docRef.get();
  const existing = docToMembership(doc);
  if (!existing) {
    return { success: false, error: '所属が見つかりません' };
  }

  await docRef.delete();
  await addEvent('membership', id, actorUserId, 'remove_user', existing, null);

  return { success: true };
}

export async function setPrimaryMembership(
  userId: string,
  orgUnitId: string,
  actorUserId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const db = getAdminDb();

  // 対象の所属を探す
  const targetSnap = await db
    .collection(MEMBERSHIPS_COLLECTION)
    .where('userId', '==', userId)
    .where('orgUnitId', '==', orgUnitId)
    .get();
  if (targetSnap.empty) {
    return { success: false, error: 'この組織への所属が見つかりません' };
  }

  const targetDoc = targetSnap.docs[0];
  const targetId = targetDoc.id;

  // 全てのisPrimaryを解除して対象をtrueに
  const allMembershipsSnap = await db
    .collection(MEMBERSHIPS_COLLECTION)
    .where('userId', '==', userId)
    .get();

  const batch = db.batch();
  for (const d of allMembershipsSnap.docs) {
    const shouldBePrimary = d.id === targetId;
    const current = docToMembership(d)!;
    if (current.isPrimary !== shouldBePrimary) {
      batch.update(d.ref, { isPrimary: shouldBePrimary, updatedAt: now() });
      if (shouldBePrimary) {
        // Event will be added outside batch
      }
    }
  }
  await batch.commit();

  await addEvent('membership', targetId, actorUserId, 'set_primary', null, { userId, orgUnitId });

  return { success: true };
}

// ========== 組織責任者 ==========

export async function listManagers(orgUnitId: string): Promise<OrgManager[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(MANAGERS_COLLECTION)
    .where('orgUnitId', '==', orgUnitId)
    .get();

  const managers = snap.docs.map((doc) => docToManager(doc)!);
  return managers.sort((a, b) => (a.userName ?? '').localeCompare(b.userName ?? '', 'ja'));
}

export async function setOrgManager(
  orgUnitId: string,
  userId: string,
  type: OrgManagerType,
  actorUserId: string
): Promise<{ success: true; manager: OrgManager } | { success: false; error: string }> {
  const db = getAdminDb();

  const orgDoc = await db.collection(ORG_UNITS_COLLECTION).doc(orgUnitId).get();
  const org = docToOrgUnit(orgDoc);
  if (!org) {
    return { success: false, error: '組織が見つかりません' };
  }

  // 既に登録されていないかチェック
  const existingSnap = await db
    .collection(MANAGERS_COLLECTION)
    .where('orgUnitId', '==', orgUnitId)
    .where('userId', '==', userId)
    .where('type', '==', type)
    .get();
  if (!existingSnap.empty) {
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

  await db.collection(MANAGERS_COLLECTION).doc(manager.id).set(manager);
  await addEvent('manager', manager.id, actorUserId, 'assign_manager', null, manager);

  return { success: true, manager };
}

export async function removeOrgManager(
  orgUnitId: string,
  userId: string,
  type: OrgManagerType,
  actorUserId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const db = getAdminDb();
  const snap = await db
    .collection(MANAGERS_COLLECTION)
    .where('orgUnitId', '==', orgUnitId)
    .where('userId', '==', userId)
    .where('type', '==', type)
    .get();

  if (snap.empty) {
    return { success: false, error: '責任者が見つかりません' };
  }

  const existing = docToManager(snap.docs[0])!;
  await snap.docs[0].ref.delete();
  await addEvent('manager', existing.id, actorUserId, 'remove_manager', existing, null);

  return { success: true };
}

// ========== ユーザー組織コンテキスト ==========

export async function getUserOrgContext(userId: string): Promise<UserOrgContext> {
  const memberships = await getUserMemberships(userId);
  const primaryMembership = memberships.find((m) => m.isPrimary);

  const db = getAdminDb();
  const managerSnap = await db
    .collection(MANAGERS_COLLECTION)
    .where('userId', '==', userId)
    .get();
  const managerEntries = managerSnap.docs.map((doc) => docToManager(doc)!);

  let primaryOrgUnit: OrgUnit | null = null;
  if (primaryMembership?.orgUnitId) {
    const orgDoc = await db.collection(ORG_UNITS_COLLECTION).doc(primaryMembership.orgUnitId).get();
    primaryOrgUnit = docToOrgUnit(orgDoc);
  }

  return {
    userId,
    primaryOrgUnitId: primaryMembership?.orgUnitId ?? null,
    primaryOrgUnit,
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

export async function getStats(): Promise<OrgStats> {
  const db = getAdminDb();

  const [unitsSnap, membershipsSnap, managersSnap] = await Promise.all([
    db.collection(ORG_UNITS_COLLECTION).get(),
    db.collection(MEMBERSHIPS_COLLECTION).get(),
    db.collection(MANAGERS_COLLECTION).get(),
  ]);

  const units = unitsSnap.docs.map((doc) => docToOrgUnit(doc)!);
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
    totalMemberships: membershipsSnap.size,
    totalManagers: managersSnap.size,
    byType,
  };
}
