/**
 * 空室ユニット Firestore 互換層
 *
 * repo.ts が呼ぶ関数名（create / update / remove / …）と
 * repo.firestore.ts の export 名（saveUnit / deleteUnit / …）を橋渡しする。
 *
 * repo.firestore.ts は変更しない。
 */

import {
  saveUnit,
  deleteUnit,
  getById,
  listPublic,
  listAll,
  saveUpdateLog,
  listUpdateLogs,
} from './repo.firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { createHash } from 'crypto';
import type {
  VacancyUnit,
  VacancyUpdate,
  VacancyViewLog,
  VacancyUnitListFilter,
  VacancyUnitStats,
  CreateVacancyUnitRequest,
  UpdateVacancyUnitRequest,
} from './types';

const VIEW_LOGS_COLLECTION = 'vacancy_view_logs';
const UNITS_COLLECTION = 'vacancy_units';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length >= 3) {
    const prefix = parts.slice(0, 3).join('.');
    const hash = createHash('sha256').update(ip).digest('hex').slice(0, 8);
    return `${prefix}.x (${hash})`;
  }
  const hash = createHash('sha256').update(ip).digest('hex').slice(0, 12);
  return `masked:${hash}`;
}

// ========== CRUD ==========

/** 空室ユニットを作成（Firestore に保存 + 作成ログ） */
export async function create(
  request: CreateVacancyUnitRequest,
  actorUserId: string,
  actorUserName?: string
): Promise<VacancyUnit> {
  const timestamp = now();
  const id = generateId('vunit');

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

  await saveUnit(unit);

  // 作成ログ
  await saveUpdateLog({
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

/** 空室ユニットを更新（Firestore に保存 + 変更ログ） */
export async function update(
  id: string,
  request: UpdateVacancyUnitRequest,
  actorUserId: string,
  actorUserName?: string
): Promise<VacancyUnit | null> {
  const existing = await getById(id);
  if (!existing) return null;

  const timestamp = now();
  const changedFields: Record<string, { before: unknown; after: unknown }> = {};

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

  await saveUnit(updated);

  if (Object.keys(changedFields).length > 0) {
    await saveUpdateLog({
      id: generateId('vupd'),
      vacancyUnitId: id,
      businessUnitId: existing.businessUnitId,
      changedFieldsJson: changedFields,
      createdAt: timestamp,
      createdByUserId: actorUserId,
      createdByUserName: actorUserName,
    });
  }

  return updated;
}

/** 空室ユニットを Firestore から削除 */
export async function remove(id: string): Promise<boolean> {
  try {
    await deleteUnit(id);
    return true;
  } catch (error) {
    console.error('[VacancyUnits compat] remove error:', error);
    return false;
  }
}

// ========== 読み取り ==========

export { getById } from './repo.firestore';
export { listPublic } from './repo.firestore';

/** Firestore から管理一覧（内部） */
export async function listInternal(
  filter: VacancyUnitListFilter = {}
): Promise<{ items: VacancyUnit[]; total: number }> {
  return listAll(filter);
}

// ========== 変更ログ ==========

export { saveUpdateLog } from './repo.firestore';

/** Firestore から変更ログ一覧 */
export async function listUpdates(
  vacancyUnitId?: string,
  limit: number = 50
): Promise<VacancyUpdate[]> {
  return listUpdateLogs(vacancyUnitId, limit);
}

// ========== 閲覧ログ ==========

/** 公開ボード閲覧ログを Firestore に書き込む */
export async function logPublicView(params: {
  businessUnitId?: string;
  ip?: string;
  userAgent?: string;
  referer?: string;
  path?: string;
  query?: Record<string, string>;
}): Promise<void> {
  try {
    const db = getAdminDb();
    const log: Omit<VacancyViewLog, 'id'> = {
      businessUnitId: params.businessUnitId ?? null,
      viewedAt: now(),
      ipHint: hashIp(params.ip),
      userAgent: params.userAgent?.slice(0, 256) ?? null,
      referer: params.referer?.slice(0, 512) ?? null,
      path: params.path ?? '/vacancies',
      queryJson: params.query ?? {},
    };
    await db.collection(VIEW_LOGS_COLLECTION).add(log);
  } catch (error) {
    console.error('[VacancyUnits compat] logPublicView error:', error);
  }
}

// ========== 統計 ==========

/** Firestore から統計を算出 */
export async function getStats(): Promise<VacancyUnitStats> {
  try {
    const { items } = await listAll({ limit: 1000 });
    const activeItems = items.filter((u) => u.status === 'active');

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
  } catch (error) {
    console.error('[VacancyUnits compat] getStats error:', error);
    return { totalUnits: 0, activeUnits: 0, totalAvailable: 0, byBusinessUnit: {} };
  }
}

// ========== シード ==========

/** Firestore にユニットが 0 件なら seed データを投入 */
export async function seedIfEmpty(): Promise<void> {
  try {
    const db = getAdminDb();
    const snap = await db.collection(UNITS_COLLECTION).limit(1).get();
    if (!snap.empty) return;

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
      await create(seed, 'system', 'システム初期化');
    }

    console.log('[VacancyUnits] Seeded', seeds.length, 'records');
  } catch (error) {
    console.error('[VacancyUnits compat] seedIfEmpty error:', error);
  }
}
