/**
 * 空室外部提示 リポジトリ
 *
 * Ticket 070: 空室 外部提示システム
 * Ticket 075: 現場最速化（1クリック更新 + 履歴 + 通知）
 *
 * STORAGE_DRIVER=firestore の場合はFirestoreを使用
 */

import { getStorageDriver } from '@/config/storage';
import * as firestoreRepo from './repo.firestore.compat';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';
import { autoAssign } from '@/lib/assignment/autoAssign';
import type {
  VacancyUnit,
  VacancyUpdate,
  VacancyViewLog,
  CreateVacancyUnitRequest,
  UpdateVacancyUnitRequest,
  VacancyUnitListFilter,
  VacancyUnitStats,
  PublicVacancyUnit,
} from './types';
import { toPublicVacancyUnit } from './types';

// ========== ドライバー判定 ==========

const isFirestore = getStorageDriver() === 'firestore';

// ========== In-Memory ストレージ（フォールバック） ==========

const memoryUnits = new Map<string, VacancyUnit>();
const memoryUpdates: VacancyUpdate[] = [];
const memoryViewLogs: VacancyViewLog[] = [];

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== 公開用一覧（認証不要） ==========

export async function listPublicAsync(filter: {
  businessUnitId?: string;
} = {}): Promise<PublicVacancyUnit[]> {
  if (isFirestore) {
    return firestoreRepo.listPublic(filter);
  }
  // Memory fallback
  let items = Array.from(memoryUnits.values()).filter(u => u.status === 'active');
  if (filter.businessUnitId) {
    items = items.filter(u => u.businessUnitId === filter.businessUnitId);
  }
  return items
    .filter(u => u.availableCount > 0)
    .sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'ja'))
    .map(toPublicVacancyUnit);
}

// 同期版（後方互換）
export function listPublicVacancyUnits(filter: {
  businessUnitId?: string;
  area?: string;
} = {}): PublicVacancyUnit[] {
  // 同期版はメモリのみ
  let items = Array.from(memoryUnits.values()).filter(u => u.status === 'active');
  if (filter.businessUnitId) {
    items = items.filter(u => u.businessUnitId === filter.businessUnitId);
  }
  if (filter.area) {
    items = items.filter(u => u.area === filter.area);
  }
  return items
    .filter(u => u.availableCount > 0)
    .sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'ja'))
    .map(toPublicVacancyUnit);
}

// ========== 内部用一覧（admin/manager） ==========

export async function listInternalAsync(filter: VacancyUnitListFilter = {}): Promise<{
  items: VacancyUnit[];
  total: number;
}> {
  if (isFirestore) {
    return firestoreRepo.listInternal(filter);
  }
  // Memory fallback
  let items = Array.from(memoryUnits.values());
  if (filter.businessUnitId) {
    items = items.filter(u => u.businessUnitId === filter.businessUnitId);
  }
  if (filter.status) {
    items = items.filter(u => u.status === filter.status);
  }
  if (filter.area) {
    items = items.filter(u => u.area === filter.area);
  }
  // Ticket 075: roomTypeフィルタ
  if (filter.roomType) {
    items = items.filter(u => u.roomType === filter.roomType);
  }
  if (filter.hasAvailability) {
    items = items.filter(u => u.availableCount > 0);
  }
  items.sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'ja'));
  const total = items.length;
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  items = items.slice(offset, offset + limit);
  return { items, total };
}

// 同期版（後方互換）
export function listVacancyUnits(filter: VacancyUnitListFilter = {}): {
  items: VacancyUnit[];
  total: number;
} {
  let items = Array.from(memoryUnits.values());
  if (filter.businessUnitId) {
    items = items.filter(u => u.businessUnitId === filter.businessUnitId);
  }
  if (filter.status) {
    items = items.filter(u => u.status === filter.status);
  }
  if (filter.area) {
    items = items.filter(u => u.area === filter.area);
  }
  // Ticket 075: roomTypeフィルタ
  if (filter.roomType) {
    items = items.filter(u => u.roomType === filter.roomType);
  }
  if (filter.hasAvailability) {
    items = items.filter(u => u.availableCount > 0);
  }
  items.sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'ja'));
  const total = items.length;
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  items = items.slice(offset, offset + limit);
  return { items, total };
}

// ========== 単一取得 ==========

export async function getByIdAsync(id: string): Promise<VacancyUnit | null> {
  if (isFirestore) {
    return firestoreRepo.getById(id);
  }
  return memoryUnits.get(id) ?? null;
}

export function getVacancyUnitById(id: string): VacancyUnit | null {
  return memoryUnits.get(id) ?? null;
}

// ========== 作成 ==========

export async function createAsync(
  request: CreateVacancyUnitRequest,
  actorUserId: string,
  actorUserName?: string
): Promise<VacancyUnit> {
  if (isFirestore) {
    return firestoreRepo.create(request, actorUserId, actorUserName);
  }
  return createVacancyUnit(request, actorUserId, actorUserName);
}

export function createVacancyUnit(
  request: CreateVacancyUnitRequest,
  actorUserId: string,
  actorUserName?: string
): VacancyUnit {
  const id = generateId('vunit');
  const timestamp = now();

  const unit: VacancyUnit = {
    id,
    businessUnitId: request.businessUnitId,
    buildingName: request.buildingName,
    area: request.area,
    roomType: request.roomType,
    capacity: request.capacity,
    availableCount: request.availableCount,
    availableFrom: request.availableFrom ?? null,
    conditionsJson: request.conditionsJson ?? {},
    priceRangeJson: request.priceRangeJson ?? {},
    status: request.status ?? 'active',
    updatedAt: timestamp,
    updatedByUserId: actorUserId,
    updatedByUserName: actorUserName,
    createdAt: timestamp,
  };

  memoryUnits.set(id, unit);

  // 作成ログ
  memoryUpdates.push({
    id: generateId('vupd'),
    vacancyUnitId: id,
    businessUnitId: request.businessUnitId,
    changedFieldsJson: { created: { before: null, after: unit } },
    createdAt: timestamp,
    createdByUserId: actorUserId,
    createdByUserName: actorUserName,
  });

  return unit;
}

// ========== 更新 ==========

export async function updateAsync(
  id: string,
  request: UpdateVacancyUnitRequest,
  actorUserId: string,
  actorUserName?: string
): Promise<VacancyUnit | null> {
  if (isFirestore) {
    return firestoreRepo.update(id, request, actorUserId, actorUserName);
  }
  return updateVacancyUnit(id, request, actorUserId, actorUserName);
}

export function updateVacancyUnit(
  id: string,
  request: UpdateVacancyUnitRequest,
  actorUserId: string,
  actorUserName?: string
): VacancyUnit | null {
  const existing = memoryUnits.get(id);
  if (!existing) return null;

  const changedFields: Record<string, { before: unknown; after: unknown }> = {};
  const timestamp = now();

  if (request.buildingName !== undefined && request.buildingName !== existing.buildingName) {
    changedFields.buildingName = { before: existing.buildingName, after: request.buildingName };
  }
  if (request.area !== undefined && request.area !== existing.area) {
    changedFields.area = { before: existing.area, after: request.area };
  }
  if (request.roomType !== undefined && request.roomType !== existing.roomType) {
    changedFields.roomType = { before: existing.roomType, after: request.roomType };
  }
  if (request.capacity !== undefined && request.capacity !== existing.capacity) {
    changedFields.capacity = { before: existing.capacity, after: request.capacity };
  }
  if (request.availableCount !== undefined && request.availableCount !== existing.availableCount) {
    changedFields.availableCount = { before: existing.availableCount, after: request.availableCount };
  }
  if (request.availableFrom !== undefined && request.availableFrom !== existing.availableFrom) {
    changedFields.availableFrom = { before: existing.availableFrom, after: request.availableFrom };
  }
  if (request.conditionsJson !== undefined) {
    changedFields.conditionsJson = { before: existing.conditionsJson, after: request.conditionsJson };
  }
  if (request.priceRangeJson !== undefined) {
    changedFields.priceRangeJson = { before: existing.priceRangeJson, after: request.priceRangeJson };
  }
  if (request.status !== undefined && request.status !== existing.status) {
    changedFields.status = { before: existing.status, after: request.status };
  }

  const updated: VacancyUnit = {
    ...existing,
    buildingName: request.buildingName ?? existing.buildingName,
    area: request.area ?? existing.area,
    roomType: request.roomType ?? existing.roomType,
    capacity: request.capacity ?? existing.capacity,
    availableCount: request.availableCount ?? existing.availableCount,
    availableFrom: request.availableFrom !== undefined ? request.availableFrom : existing.availableFrom,
    conditionsJson: request.conditionsJson ?? existing.conditionsJson,
    priceRangeJson: request.priceRangeJson ?? existing.priceRangeJson,
    status: request.status ?? existing.status,
    updatedAt: timestamp,
    updatedByUserId: actorUserId,
    updatedByUserName: actorUserName,
  };

  memoryUnits.set(id, updated);

  if (Object.keys(changedFields).length > 0) {
    memoryUpdates.push({
      id: generateId('vupd'),
      vacancyUnitId: id,
      businessUnitId: existing.businessUnitId,
      changedFieldsJson: changedFields,
      createdAt: timestamp,
      createdByUserId: actorUserId,
      createdByUserName: actorUserName,
    });

    // Ticket 075: 重要変更時の通知
    notifyImportantChangeAsync(existing, updated, changedFields).catch(console.error);
  }

  return updated;
}

// ========== Ticket 075: 重要変更通知 ==========

/**
 * 重要変更かどうか判定
 * - availableCount の増減
 * - availableFrom の変更
 * - status が paused になった
 */
function isImportantChange(changedFields: Record<string, { before: unknown; after: unknown }>): boolean {
  if (changedFields.availableCount) return true;
  if (changedFields.availableFrom) return true;
  if (changedFields.status && changedFields.status.after === 'paused') return true;
  return false;
}

/**
 * 重要変更時の通知を送信
 */
async function notifyImportantChangeAsync(
  before: VacancyUnit,
  after: VacancyUnit,
  changedFields: Record<string, { before: unknown; after: unknown }>
): Promise<void> {
  if (!isImportantChange(changedFields)) return;

  // 通知対象を取得（businessUnitのマネージャー）
  const assignResult = autoAssign({
    entityType: 'ticket',
    businessUnitId: after.businessUnitId,
  });
  if (!assignResult.ok) return;

  // 変更内容の説明を生成
  const changes: string[] = [];
  if (changedFields.availableCount) {
    changes.push(`空室 ${changedFields.availableCount.before}→${changedFields.availableCount.after}`);
  }
  if (changedFields.availableFrom) {
    const formatDate = (d: unknown) => d ? String(d).slice(0, 10) : '未定';
    changes.push(`入居可 ${formatDate(changedFields.availableFrom.before)}→${formatDate(changedFields.availableFrom.after)}`);
  }
  if (changedFields.status) {
    const statusLabels: Record<string, string> = { active: '公開中', paused: '一時停止' };
    changes.push(`ステータス ${statusLabels[String(changedFields.status.before)] || changedFields.status.before}→${statusLabels[String(changedFields.status.after)] || changedFields.status.after}`);
  }

  // fingerprint: 1時間単位で重複排除
  const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const fingerprint = `notif:vacancy_update:${after.id}:${hourKey}`;

  try {
    await createNotificationAsync({
      tenantId: 'default',
      userId: assignResult.assigneeUserId,
      type: 'vacancy_unit_updated',
      severity: changedFields.status?.after === 'paused' ? 'warning' : 'info',
      title: `[空室更新] ${after.buildingName} ${after.roomType}`,
      message: changes.join(', '),
      url: `/dashboard/vacancies?businessUnitId=${after.businessUnitId}`,
      fingerprint,
    });
  } catch (error) {
    console.error('[VacancyUnits] Failed to send notification:', error);
  }
}

// ========== 削除 ==========

export async function removeAsync(id: string): Promise<boolean> {
  if (isFirestore) {
    return firestoreRepo.remove(id);
  }
  return memoryUnits.delete(id);
}

export function deleteVacancyUnit(id: string): boolean {
  return memoryUnits.delete(id);
}

// ========== 更新履歴 ==========

export async function listUpdatesAsync(
  vacancyUnitId?: string,
  limit: number = 50
): Promise<VacancyUpdate[]> {
  if (isFirestore) {
    return firestoreRepo.listUpdates(vacancyUnitId, limit);
  }
  return listVacancyUpdates(vacancyUnitId, limit);
}

export function listVacancyUpdates(
  vacancyUnitId?: string,
  limit: number = 50
): VacancyUpdate[] {
  let items = [...memoryUpdates];
  if (vacancyUnitId) {
    items = items.filter(u => u.vacancyUnitId === vacancyUnitId);
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, limit);
}

// ========== 公開ボード閲覧ログ ==========

export async function logPublicViewAsync(params: {
  businessUnitId?: string;
  ip?: string;
  userAgent?: string;
  referer?: string;
  path?: string;
  query?: Record<string, string>;
}): Promise<void> {
  if (isFirestore) {
    return firestoreRepo.logPublicView(params);
  }
  // Memory: 簡易ログ
  memoryViewLogs.push({
    id: generateId('vlog'),
    businessUnitId: params.businessUnitId ?? null,
    viewedAt: now(),
    ipHint: params.ip ? params.ip.split('.').slice(0, 3).join('.') + '.x' : null,
    userAgent: params.userAgent ?? null,
    referer: params.referer ?? null,
    path: params.path ?? '/vacancies',
    queryJson: params.query ?? {},
  });
}

// 後方互換用
export function addViewLog(params: {
  vacancyUnitId?: string;
  viewerType: 'public' | 'external_account';
  externalUserId?: string;
  ipAddress?: string;
  userAgent?: string;
}): void {
  // 非同期で処理（fire and forget）
  logPublicViewAsync({
    businessUnitId: undefined,
    ip: params.ipAddress,
    userAgent: params.userAgent,
    path: '/vacancies',
  }).catch(console.error);
}

// ========== 統計 ==========

export async function getStatsAsync(): Promise<VacancyUnitStats> {
  if (isFirestore) {
    return firestoreRepo.getStats();
  }
  return getVacancyUnitStats();
}

export function getVacancyUnitStats(): VacancyUnitStats {
  const items = Array.from(memoryUnits.values());
  const activeItems = items.filter(u => u.status === 'active');

  const byBusinessUnit: Record<string, { units: number; available: number }> = {};
  for (const unit of items) {
    if (!byBusinessUnit[unit.businessUnitId]) {
      byBusinessUnit[unit.businessUnitId] = { units: 0, available: 0 };
    }
    byBusinessUnit[unit.businessUnitId].units += 1;
    byBusinessUnit[unit.businessUnitId].available += unit.availableCount;
  }

  return {
    totalUnits: items.length,
    activeUnits: activeItems.length,
    totalAvailable: items.reduce((sum, u) => sum + u.availableCount, 0),
    byBusinessUnit,
  };
}

// ========== シードデータ ==========

export async function seedIfEmptyAsync(): Promise<void> {
  if (isFirestore) {
    return firestoreRepo.seedIfEmpty();
  }
  seedVacancyUnitsIfEmpty();
}

export function seedVacancyUnitsIfEmpty(): void {
  if (memoryUnits.size > 0) return;

  const seeds: CreateVacancyUnitRequest[] = [
    {
      businessUnitId: 'bu_housing',
      buildingName: 'パシフィック',
      area: '東京都',
      roomType: '個室',
      capacity: 22,
      availableCount: 10,
      availableFrom: '2026-02-15',
      conditionsJson: {
        minCareLevel: 1,
        maxCareLevel: 5,
        acceptsDementia: true,
        acceptsMedicalCare: true,
        acceptsTerminalCare: true,
      },
      priceRangeJson: {
        monthlyMin: 15,
        monthlyMax: 25,
        depositMin: 0,
        depositMax: 30,
      },
    },
    {
      businessUnitId: 'bu_housing',
      buildingName: 'ルネッサンス',
      area: '東京都',
      roomType: '個室',
      capacity: 9,
      availableCount: 2,
      availableFrom: '2026-03-01',
      conditionsJson: {
        minCareLevel: 1,
        maxCareLevel: 4,
        acceptsDementia: true,
        acceptsMedicalCare: false,
        acceptsTerminalCare: false,
      },
      priceRangeJson: {
        monthlyMin: 12,
        monthlyMax: 18,
        depositMin: 0,
        depositMax: 20,
      },
    },
    {
      businessUnitId: 'bu_housing',
      buildingName: 'セレーネ',
      area: '神奈川県',
      roomType: '個室',
      capacity: 9,
      availableCount: 4,
      availableFrom: '2026-02-20',
      conditionsJson: {
        minCareLevel: 1,
        maxCareLevel: 5,
        acceptsDementia: true,
        acceptsMedicalCare: true,
        acceptsTerminalCare: true,
      },
      priceRangeJson: {
        monthlyMin: 14,
        monthlyMax: 22,
        depositMin: 0,
        depositMax: 25,
      },
    },
  ];

  for (const seed of seeds) {
    createVacancyUnit(seed, 'system', 'システム初期化');
  }
}
