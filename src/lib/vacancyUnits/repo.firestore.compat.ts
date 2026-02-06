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
  updateUnit,
  deleteUnit,
  getById,
  listPublic,
  listAll,
  saveUpdateLog,
  listUpdateLogs,
} from './repo.firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  VacancyUnit,
  VacancyUpdate,
  VacancyViewLog,
  VacancyUnitListFilter,
  VacancyUnitStats,
  PublicVacancyUnit,
  CreateVacancyUnitRequest,
} from './types';
import { toPublicVacancyUnit } from './types';

const VIEW_LOGS_COLLECTION = 'vacancy_view_logs';
const UNITS_COLLECTION = 'vacancy_units';

// ========== CRUD ==========

/** VacancyUnit を Firestore に保存（新規） */
export async function create(unit: VacancyUnit): Promise<void> {
  await saveUnit(unit);
}

/** VacancyUnit を Firestore に上書き保存（更新） */
export async function update(unit: VacancyUnit): Promise<void> {
  await saveUnit(unit);
}

/** VacancyUnit を Firestore から削除 */
export async function remove(id: string): Promise<void> {
  await deleteUnit(id);
}

// ========== 読み取り ==========

/** Firestore から ID で取得 */
export { getById } from './repo.firestore';

/** Firestore から公開一覧（status=active） */
export { listPublic } from './repo.firestore';

/** Firestore から管理一覧（内部） */
export async function listInternal(
  filter: VacancyUnitListFilter = {}
): Promise<{ items: VacancyUnit[]; total: number }> {
  return listAll(filter);
}

// ========== 変更ログ ==========

/** 変更ログを Firestore に保存 */
export { saveUpdateLog } from './repo.firestore';

/** Firestore から変更ログ一覧 */
export async function listUpdates(
  vacancyUnitId?: string,
  limit: number = 50
): Promise<VacancyUpdate[]> {
  return listUpdateLogs(vacancyUnitId, limit);
}

// ========== 閲覧ログ ==========

/** 閲覧ログを Firestore に書き込む */
export async function logPublicView(params: {
  vacancyUnitId?: string;
  viewerType: 'public' | 'external_account';
  externalUserId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const db = getAdminDb();
  const id = `vlog_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const log: VacancyViewLog = {
    id,
    vacancyUnitId: params.vacancyUnitId ?? null,
    viewerType: params.viewerType,
    externalUserId: params.externalUserId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    createdAt: new Date().toISOString(),
  };
  await db
    .collection(VIEW_LOGS_COLLECTION)
    .doc(id)
    .set({
      ...log,
      _createdAt: Timestamp.now(),
    });
}

// ========== 統計 ==========

/** Firestore から統計を算出 */
export async function getStats(): Promise<VacancyUnitStats> {
  const { items } = await listAll({});
  const activeItems = items.filter((u) => u.status === 'active');

  const byBusinessUnit: Record<string, { units: number; available: number }> =
    {};
  for (const unit of items) {
    const entry = byBusinessUnit[unit.businessUnitId] ?? {
      units: 0,
      available: 0,
    };
    entry.units += 1;
    entry.available += unit.availableCount;
    byBusinessUnit[unit.businessUnitId] = entry;
  }

  return {
    totalUnits: items.length,
    activeUnits: activeItems.length,
    totalAvailable: items.reduce((sum, u) => sum + u.availableCount, 0),
    byBusinessUnit,
  };
}

// ========== シード ==========

/** Firestore にユニットが 0 件なら seed データを投入 */
export async function seedIfEmpty(
  seeds: CreateVacancyUnitRequest[],
  actorUserId: string = 'system',
  actorUserName: string = 'システム初期化'
): Promise<boolean> {
  const db = getAdminDb();
  const snap = await db.collection(UNITS_COLLECTION).limit(1).get();
  if (!snap.empty) return false;

  for (const seed of seeds) {
    const id = `vunit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date().toISOString();
    const unit: VacancyUnit = {
      id,
      businessUnitId: seed.businessUnitId,
      buildingName: seed.buildingName,
      area: seed.area,
      roomType: seed.roomType,
      capacity: seed.capacity,
      availableCount: seed.availableCount,
      availableFrom: seed.availableFrom ?? null,
      conditionsJson: seed.conditionsJson ?? {},
      priceRangeJson: seed.priceRangeJson ?? {},
      status: seed.status ?? 'active',
      updatedAt: timestamp,
      updatedByUserId: actorUserId,
      updatedByUserName: actorUserName,
      createdAt: timestamp,
    };
    await saveUnit(unit);
  }
  return true;
}
