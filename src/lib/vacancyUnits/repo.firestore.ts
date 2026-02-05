/**
 * 空室外部提示 Firestore リポジトリ
 *
 * Ticket 070: 空室 外部提示システム
 *
 * コレクション:
 * - vacancy_units: 空室ユニット
 * - vacancy_updates: 更新履歴
 * - vacancy_view_logs: 公開ボード閲覧ログ
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { createHash } from 'crypto';
import type {
  VacancyUnit,
  VacancyUpdate,
  VacancyViewLog,
  VacancyUnitStatus,
  CreateVacancyUnitRequest,
  UpdateVacancyUnitRequest,
  VacancyUnitListFilter,
  VacancyUnitStats,
  PublicVacancyUnit,
} from './types';
import { toPublicVacancyUnit } from './types';

// ========== コレクション名 ==========

const COLLECTION_UNITS = 'vacancy_units';
const COLLECTION_UPDATES = 'vacancy_updates';
const COLLECTION_VIEW_LOGS = 'vacancy_view_logs';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

/**
 * IPアドレスをハッシュ化（生IP保存しない）
 */
function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // 最初の3オクテットのみ + ハッシュ
  const parts = ip.split('.');
  if (parts.length >= 3) {
    const prefix = parts.slice(0, 3).join('.');
    const hash = createHash('sha256').update(ip).digest('hex').slice(0, 8);
    return `${prefix}.x (${hash})`;
  }
  // IPv6等
  const hash = createHash('sha256').update(ip).digest('hex').slice(0, 12);
  return `masked:${hash}`;
}

// ========== Firestore → 型変換 ==========

function docToVacancyUnit(doc: FirebaseFirestore.DocumentSnapshot): VacancyUnit | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: doc.id,
    businessUnitId: data.businessUnitId || '',
    buildingName: data.buildingName || '',
    area: data.area || '',
    roomType: data.roomType || '',
    capacity: data.capacity ?? 0,
    availableCount: data.availableCount ?? 0,
    availableFrom: data.availableFrom || null,
    conditionsJson: data.conditionsJson || {},
    priceRangeJson: data.priceRangeJson || {},
    status: data.status || 'active',
    updatedAt: data.updatedAt || '',
    updatedByUserId: data.updatedByUserId || '',
    updatedByUserName: data.updatedByUserName,
    createdAt: data.createdAt || '',
  };
}

function docToVacancyUpdate(doc: FirebaseFirestore.DocumentSnapshot): VacancyUpdate | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: doc.id,
    vacancyUnitId: data.vacancyUnitId || '',
    businessUnitId: data.businessUnitId || '',
    changedFieldsJson: data.changedFieldsJson || {},
    createdAt: data.createdAt || '',
    createdByUserId: data.createdByUserId || '',
    createdByUserName: data.createdByUserName,
  };
}

// ========== 公開用一覧（認証不要） ==========

export async function listPublic(filter: {
  businessUnitId?: string;
} = {}): Promise<PublicVacancyUnit[]> {
  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(COLLECTION_UNITS)
      .where('status', '==', 'active');

    if (filter.businessUnitId) {
      query = query.where('businessUnitId', '==', filter.businessUnitId);
    }

    const snapshot = await query.get();
    const units = snapshot.docs
      .map(docToVacancyUnit)
      .filter((u): u is VacancyUnit => u !== null);

    // 空室ありのみ & ソート
    return units
      .filter(u => u.availableCount > 0)
      .sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'ja'))
      .map(toPublicVacancyUnit);
  } catch (error) {
    console.error('[VacancyUnits] listPublic error:', error);
    return [];
  }
}

// ========== 内部用一覧（admin/manager） ==========

export async function listInternal(filter: VacancyUnitListFilter = {}): Promise<{
  items: VacancyUnit[];
  total: number;
}> {
  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(COLLECTION_UNITS);

    if (filter.businessUnitId) {
      query = query.where('businessUnitId', '==', filter.businessUnitId);
    }
    if (filter.status) {
      query = query.where('status', '==', filter.status);
    }

    const snapshot = await query.get();
    let items = snapshot.docs
      .map(docToVacancyUnit)
      .filter((u): u is VacancyUnit => u !== null);

    // エリアフィルタ（Firestoreで複合クエリ制限があるため後処理）
    if (filter.area) {
      items = items.filter(u => u.area === filter.area);
    }
    if (filter.hasAvailability) {
      items = items.filter(u => u.availableCount > 0);
    }

    // ソート
    items.sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'ja'));

    const total = items.length;

    // ページネーション
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    items = items.slice(offset, offset + limit);

    return { items, total };
  } catch (error) {
    console.error('[VacancyUnits] listInternal error:', error);
    return { items: [], total: 0 };
  }
}

// ========== 単一取得 ==========

export async function getById(id: string): Promise<VacancyUnit | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(COLLECTION_UNITS).doc(id).get();
    return docToVacancyUnit(doc);
  } catch (error) {
    console.error('[VacancyUnits] getById error:', error);
    return null;
  }
}

// ========== 作成 ==========

export async function create(
  request: CreateVacancyUnitRequest,
  actorUserId: string,
  actorUserName?: string
): Promise<VacancyUnit> {
  const db = getAdminDb();
  const timestamp = now();

  const data = {
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
    updatedByUserName: actorUserName ?? null,
    createdAt: timestamp,
  };

  const docRef = await db.collection(COLLECTION_UNITS).add(data);

  // 作成ログ
  await db.collection(COLLECTION_UPDATES).add({
    vacancyUnitId: docRef.id,
    businessUnitId: request.businessUnitId,
    changedFieldsJson: { created: { before: null, after: data } },
    createdAt: timestamp,
    createdByUserId: actorUserId,
    createdByUserName: actorUserName ?? null,
  });

  return {
    id: docRef.id,
    ...data,
    conditionsJson: data.conditionsJson,
    priceRangeJson: data.priceRangeJson,
    availableFrom: data.availableFrom,
    updatedByUserName: actorUserName,
  };
}

// ========== 更新 ==========

export async function update(
  id: string,
  request: UpdateVacancyUnitRequest,
  actorUserId: string,
  actorUserName?: string
): Promise<VacancyUnit | null> {
  const db = getAdminDb();
  const docRef = db.collection(COLLECTION_UNITS).doc(id);

  const existing = await getById(id);
  if (!existing) return null;

  const timestamp = now();
  const changedFields: Record<string, { before: unknown; after: unknown }> = {};

  // 変更検出
  const updates: Record<string, unknown> = {
    updatedAt: timestamp,
    updatedByUserId: actorUserId,
    updatedByUserName: actorUserName ?? null,
  };

  if (request.buildingName !== undefined && request.buildingName !== existing.buildingName) {
    changedFields.buildingName = { before: existing.buildingName, after: request.buildingName };
    updates.buildingName = request.buildingName;
  }
  if (request.area !== undefined && request.area !== existing.area) {
    changedFields.area = { before: existing.area, after: request.area };
    updates.area = request.area;
  }
  if (request.roomType !== undefined && request.roomType !== existing.roomType) {
    changedFields.roomType = { before: existing.roomType, after: request.roomType };
    updates.roomType = request.roomType;
  }
  if (request.capacity !== undefined && request.capacity !== existing.capacity) {
    changedFields.capacity = { before: existing.capacity, after: request.capacity };
    updates.capacity = request.capacity;
  }
  if (request.availableCount !== undefined && request.availableCount !== existing.availableCount) {
    changedFields.availableCount = { before: existing.availableCount, after: request.availableCount };
    updates.availableCount = request.availableCount;
  }
  if (request.availableFrom !== undefined && request.availableFrom !== existing.availableFrom) {
    changedFields.availableFrom = { before: existing.availableFrom, after: request.availableFrom };
    updates.availableFrom = request.availableFrom;
  }
  if (request.conditionsJson !== undefined) {
    changedFields.conditionsJson = { before: existing.conditionsJson, after: request.conditionsJson };
    updates.conditionsJson = request.conditionsJson;
  }
  if (request.priceRangeJson !== undefined) {
    changedFields.priceRangeJson = { before: existing.priceRangeJson, after: request.priceRangeJson };
    updates.priceRangeJson = request.priceRangeJson;
  }
  if (request.status !== undefined && request.status !== existing.status) {
    changedFields.status = { before: existing.status, after: request.status };
    updates.status = request.status;
  }

  await docRef.update(updates);

  // 変更ログ（必ず作成）
  if (Object.keys(changedFields).length > 0) {
    await db.collection(COLLECTION_UPDATES).add({
      vacancyUnitId: id,
      businessUnitId: existing.businessUnitId,
      changedFieldsJson: changedFields,
      createdAt: timestamp,
      createdByUserId: actorUserId,
      createdByUserName: actorUserName ?? null,
    });
  }

  return getById(id);
}

// ========== 削除 ==========

export async function remove(id: string): Promise<boolean> {
  try {
    const db = getAdminDb();
    await db.collection(COLLECTION_UNITS).doc(id).delete();
    return true;
  } catch (error) {
    console.error('[VacancyUnits] remove error:', error);
    return false;
  }
}

// ========== 更新履歴取得 ==========

export async function listUpdates(
  vacancyUnitId?: string,
  limit: number = 50
): Promise<VacancyUpdate[]> {
  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(COLLECTION_UPDATES)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (vacancyUnitId) {
      query = db.collection(COLLECTION_UPDATES)
        .where('vacancyUnitId', '==', vacancyUnitId)
        .orderBy('createdAt', 'desc')
        .limit(limit);
    }

    const snapshot = await query.get();
    return snapshot.docs
      .map(docToVacancyUpdate)
      .filter((u): u is VacancyUpdate => u !== null);
  } catch (error) {
    console.error('[VacancyUnits] listUpdates error:', error);
    return [];
  }
}

// ========== 公開ボード閲覧ログ ==========

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

    await db.collection(COLLECTION_VIEW_LOGS).add(log);
  } catch (error) {
    // 閲覧ログの失敗は主処理を落とさない
    console.error('[VacancyUnits] logPublicView error:', error);
  }
}

// ========== 統計 ==========

export async function getStats(): Promise<VacancyUnitStats> {
  try {
    const { items } = await listInternal({ limit: 1000 });
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
  } catch (error) {
    console.error('[VacancyUnits] getStats error:', error);
    return {
      totalUnits: 0,
      activeUnits: 0,
      totalAvailable: 0,
      byBusinessUnit: {},
    };
  }
}

// ========== シードデータ（開発用） ==========

export async function seedIfEmpty(): Promise<void> {
  try {
    const { total } = await listInternal({ limit: 1 });
    if (total > 0) return;

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
    console.error('[VacancyUnits] seedIfEmpty error:', error);
  }
}
