/**
 * 空室外部提示 リポジトリ
 *
 * Ticket 070: 空室 外部提示システム
 */

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

// ========== In-Memory ストレージ ==========

const vacancyUnits = new Map<string, VacancyUnit>();
const vacancyUpdates: VacancyUpdate[] = [];
const vacancyViewLogs: VacancyViewLog[] = [];

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== 空室ユニット CRUD ==========

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

  vacancyUnits.set(id, unit);

  // 作成ログ
  addUpdateLog(id, { created: { before: null, after: unit } }, actorUserId, actorUserName);

  return unit;
}

export function updateVacancyUnit(
  id: string,
  request: UpdateVacancyUnitRequest,
  actorUserId: string,
  actorUserName?: string
): VacancyUnit | null {
  const existing = vacancyUnits.get(id);
  if (!existing) return null;

  const changedFields: Record<string, { before: unknown; after: unknown }> = {};

  // 変更検出
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

  const timestamp = now();

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

  vacancyUnits.set(id, updated);

  // 変更ログ
  if (Object.keys(changedFields).length > 0) {
    addUpdateLog(id, changedFields, actorUserId, actorUserName);
  }

  return updated;
}

export function deleteVacancyUnit(id: string): boolean {
  return vacancyUnits.delete(id);
}

export function getVacancyUnitById(id: string): VacancyUnit | null {
  return vacancyUnits.get(id) ?? null;
}

// ========== 一覧取得 ==========

export function listVacancyUnits(filter: VacancyUnitListFilter = {}): {
  items: VacancyUnit[];
  total: number;
} {
  let items = Array.from(vacancyUnits.values());

  // フィルタ
  if (filter.businessUnitId) {
    items = items.filter(u => u.businessUnitId === filter.businessUnitId);
  }
  if (filter.status) {
    items = items.filter(u => u.status === filter.status);
  }
  if (filter.area) {
    items = items.filter(u => u.area === filter.area);
  }
  if (filter.hasAvailability) {
    items = items.filter(u => u.availableCount > 0);
  }

  // ソート（建物名昇順）
  items.sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'ja'));

  const total = items.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  items = items.slice(offset, offset + limit);

  return { items, total };
}

/**
 * 公開用一覧（active のみ）
 */
export function listPublicVacancyUnits(filter: {
  businessUnitId?: string;
  area?: string;
} = {}): PublicVacancyUnit[] {
  const { items } = listVacancyUnits({
    ...filter,
    status: 'active',
  });

  return items.map(toPublicVacancyUnit);
}

// ========== 更新履歴 ==========

function addUpdateLog(
  vacancyUnitId: string,
  changedFieldsJson: Record<string, { before: unknown; after: unknown }>,
  actorUserId: string,
  actorUserName?: string
): void {
  const update: VacancyUpdate = {
    id: generateId('vupd'),
    vacancyUnitId,
    changedFieldsJson,
    createdAt: now(),
    createdByUserId: actorUserId,
    createdByUserName: actorUserName,
  };
  vacancyUpdates.push(update);
}

export function listVacancyUpdates(
  vacancyUnitId?: string,
  limit: number = 50
): VacancyUpdate[] {
  let items = [...vacancyUpdates];

  if (vacancyUnitId) {
    items = items.filter(u => u.vacancyUnitId === vacancyUnitId);
  }

  // 新しい順
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return items.slice(0, limit);
}

// ========== 閲覧ログ ==========

export function addViewLog(params: {
  vacancyUnitId?: string;
  viewerType: 'public' | 'external_account';
  externalUserId?: string;
  ipAddress?: string;
  userAgent?: string;
}): void {
  const log: VacancyViewLog = {
    id: generateId('vlog'),
    vacancyUnitId: params.vacancyUnitId ?? null,
    viewerType: params.viewerType,
    externalUserId: params.externalUserId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    createdAt: now(),
  };
  vacancyViewLogs.push(log);
}

export function listViewLogs(limit: number = 100): VacancyViewLog[] {
  return [...vacancyViewLogs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ========== 統計 ==========

export function getVacancyUnitStats(): VacancyUnitStats {
  const items = Array.from(vacancyUnits.values());
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

export function seedVacancyUnitsIfEmpty(): void {
  if (vacancyUnits.size > 0) return;

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
