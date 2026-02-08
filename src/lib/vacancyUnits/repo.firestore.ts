/**
 * 空室ユニット Firestoreリポジトリ（最小実装）
 *
 * PROD-003: 本番永続化
 *
 * 対応関数:
 * - saveUnit / updateUnit / deleteUnit: CRUD
 * - getById: 個別取得
 * - listPublic: 公開一覧（status=active）
 * - listAll: 管理一覧
 * - saveUpdateLog: 変更差分ログ
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  VacancyUnit,
  VacancyUpdate,
  PublicVacancyUnit,
  VacancyUnitListFilter,
} from './types';
import { toPublicVacancyUnit } from './types';

const UNITS_COLLECTION = 'vacancy_units';
const UPDATES_COLLECTION = 'vacancy_updates';

// ========== CRUD ==========

/**
 * 空室ユニットを保存（新規/上書き）
 */
export async function saveUnit(unit: VacancyUnit): Promise<void> {
  const db = getAdminDb();
  await db
    .collection(UNITS_COLLECTION)
    .doc(unit.id)
    .set({
      ...unit,
      _updatedAt: Timestamp.fromDate(new Date(unit.updatedAt)),
      _createdAt: Timestamp.fromDate(new Date(unit.createdAt)),
    });
}

/**
 * 空室ユニットを更新
 */
export async function updateUnit(
  id: string,
  patch: Partial<VacancyUnit>
): Promise<void> {
  const db = getAdminDb();
  await db
    .collection(UNITS_COLLECTION)
    .doc(id)
    .update({
      ...patch,
      _updatedAt: Timestamp.now(),
    });
}

/**
 * 空室ユニットを削除
 */
export async function deleteUnit(id: string): Promise<void> {
  const db = getAdminDb();
  await db.collection(UNITS_COLLECTION).doc(id).delete();
}

/**
 * IDで取得
 */
export async function getById(id: string): Promise<VacancyUnit | null> {
  const db = getAdminDb();
  const doc = await db.collection(UNITS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return docToUnit(doc);
}

// ========== 一覧 ==========

/**
 * 公開一覧（status=active, 個人情報なし）
 */
export async function listPublic(filter: {
  businessUnitId?: string;
  area?: string;
} = {}): Promise<PublicVacancyUnit[]> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db
    .collection(UNITS_COLLECTION)
    .where('status', '==', 'active');

  if (filter.businessUnitId) {
    q = q.where('businessUnitId', '==', filter.businessUnitId);
  }

  const snap = await q.get();
  let items = snap.docs.map(docToUnit);

  if (filter.area) {
    items = items.filter((u) => u.area === filter.area);
  }

  // 建物名昇順
  items.sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'ja'));

  return items.map(toPublicVacancyUnit);
}

/**
 * 管理一覧（全ステータス）
 */
export async function listAll(
  filter: VacancyUnitListFilter = {}
): Promise<{ items: VacancyUnit[]; total: number }> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(UNITS_COLLECTION);

  if (filter.businessUnitId) {
    q = q.where('businessUnitId', '==', filter.businessUnitId);
  }
  if (filter.status) {
    q = q.where('status', '==', filter.status);
  }

  const snap = await q.get();
  let items = snap.docs.map(docToUnit);

  if (filter.area) {
    items = items.filter((u) => u.area === filter.area);
  }
  if (filter.hasAvailability) {
    items = items.filter((u) => u.availableCount > 0);
  }

  // 建物名昇順
  items.sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'ja'));

  const total = items.length;
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;

  return { items: items.slice(offset, offset + limit), total };
}

// ========== 変更ログ ==========

/**
 * 変更差分ログを保存
 */
export async function saveUpdateLog(update: VacancyUpdate): Promise<void> {
  const db = getAdminDb();
  await db
    .collection(UPDATES_COLLECTION)
    .doc(update.id)
    .set({
      ...update,
      _createdAt: Timestamp.fromDate(new Date(update.createdAt)),
    });
}

/**
 * 変更ログ一覧
 */
export async function listUpdateLogs(
  vacancyUnitId?: string,
  limit: number = 50
): Promise<VacancyUpdate[]> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db
    .collection(UPDATES_COLLECTION)
    .orderBy('_createdAt', 'desc')
    .limit(limit);

  if (vacancyUnitId) {
    q = q.where('vacancyUnitId', '==', vacancyUnitId);
  }

  const snap = await q.get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: data.id ?? doc.id,
      vacancyUnitId: data.vacancyUnitId,
      changedFieldsJson: data.changedFieldsJson ?? {},
      createdAt: data.createdAt ?? new Date().toISOString(),
      createdByUserId: data.createdByUserId ?? 'system',
      createdByUserName: data.createdByUserName,
    } as VacancyUpdate;
  });
}

// ========== ヘルパー ==========

function docToUnit(doc: FirebaseFirestore.DocumentSnapshot): VacancyUnit {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    businessUnitId: data.businessUnitId ?? '',
    buildingName: data.buildingName ?? '',
    area: data.area ?? '',
    roomType: data.roomType ?? '',
    capacity: data.capacity ?? 0,
    availableCount: data.availableCount ?? 0,
    availableFrom: data.availableFrom ?? null,
    conditionsJson: data.conditionsJson ?? {},
    priceRangeJson: data.priceRangeJson ?? {},
    status: data.status ?? 'active',
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    updatedByUserId: data.updatedByUserId ?? 'system',
    updatedByUserName: data.updatedByUserName,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}
