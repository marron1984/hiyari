// ======== 空室管理 Firestoreヘルパー ========

import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { Facility, VacancyStatus, VacancyEvent, FacilityWithVacancy } from '@/types/vacancy';

// ======== 施設 ========

/**
 * 施設一覧を取得
 */
export async function getFacilities(tenantId: string = DEFAULT_TENANT_ID): Promise<Facility[]> {
  if (!db) throw new Error('Firestore not initialized');

  const q = query(
    collection(db, 'facilities'),
    where('tenantId', '==', tenantId)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate() || new Date(),
      updatedAt: d.data().updatedAt?.toDate(),
    } as Facility))
    .filter((f) => f.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

/**
 * 施設を作成（初期セットアップ用）
 */
export async function createFacility(
  data: Omit<Facility, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  if (!db) throw new Error('Firestore not initialized');

  const docRef = await addDoc(collection(db, 'facilities'), {
    ...data,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

// ======== 空室状態 ========

/**
 * 全施設の空室状態を取得
 */
export async function getAllVacancyStatus(): Promise<Map<string, VacancyStatus>> {
  if (!db) throw new Error('Firestore not initialized');

  const snapshot = await getDocs(collection(db, 'vacancyStatus'));
  const map = new Map<string, VacancyStatus>();

  snapshot.docs.forEach((d) => {
    const data = d.data();
    map.set(d.id, {
      facilityId: d.id,
      vacantCount: data.vacantCount ?? 0,
      note: data.note,
      updatedAt: data.updatedAt?.toDate() || new Date(),
      updatedBy: data.updatedBy || '',
      updatedByName: data.updatedByName || '',
    });
  });

  return map;
}

/**
 * 施設一覧 + 空室状態を結合して取得
 */
export async function getFacilitiesWithVacancy(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<FacilityWithVacancy[]> {
  const [facilities, vacancyMap] = await Promise.all([
    getFacilities(tenantId),
    getAllVacancyStatus(),
  ]);

  return facilities.map((facility) => ({
    facility,
    vacancy: vacancyMap.get(facility.id) || null,
  }));
}

/**
 * 空室状態を更新（楽観ロック付き、監査ログ自動作成）
 */
export async function updateVacancyStatus(params: {
  facilityId: string;
  vacantCount: number;
  note?: string;
  updatedBy: string;
  updatedByName: string;
  lastKnownUpdatedAt?: Date;
}): Promise<VacancyStatus> {
  if (!db) throw new Error('Firestore not initialized');
  const firestore = db; // TypeScript用にnon-null確定

  const { facilityId, vacantCount, note, updatedBy, updatedByName, lastKnownUpdatedAt } = params;

  const vacancyRef = doc(firestore, 'vacancyStatus', facilityId);

  return await runTransaction(firestore, async (transaction) => {
    const vacancyDoc = await transaction.get(vacancyRef);
    const now = Timestamp.now();

    // 変更前の値（Firestoreはundefined不可なのでnullに）
    const before = vacancyDoc.exists()
      ? {
          vacantCount: vacancyDoc.data().vacantCount ?? 0,
          note: vacancyDoc.data().note ?? null,
        }
      : { vacantCount: 0, note: null };

    // 楽観ロックチェック
    if (lastKnownUpdatedAt && vacancyDoc.exists()) {
      const existingUpdatedAt = vacancyDoc.data().updatedAt?.toDate();
      if (existingUpdatedAt && existingUpdatedAt.getTime() !== lastKnownUpdatedAt.getTime()) {
        throw new Error('データが他のユーザーに更新されています。ページを更新してください。');
      }
    }

    // 変更後の値（Firestoreはundefined不可なのでnullに）
    const after = { vacantCount, note: note ?? null };

    // 空室状態を更新
    const newData = {
      facilityId,
      vacantCount,
      note: note || null,
      updatedAt: now,
      updatedBy,
      updatedByName,
    };
    transaction.set(vacancyRef, newData);

    // 監査ログを作成（vacancyEventsコレクション）
    const eventRef = doc(collection(firestore, 'vacancyEvents'));
    transaction.set(eventRef, {
      facilityId,
      before,
      after,
      changedBy: updatedBy,
      changedByName: updatedByName,
      changedAt: now,
    });

    return {
      facilityId,
      vacantCount,
      note,
      updatedAt: now.toDate(),
      updatedBy,
      updatedByName,
    };
  });
}

/**
 * 空室変更ログを取得
 */
export async function getVacancyEvents(
  facilityId?: string,
  limitCount: number = 50
): Promise<VacancyEvent[]> {
  if (!db) throw new Error('Firestore not initialized');

  let q = query(collection(db, 'vacancyEvents'));

  if (facilityId) {
    q = query(
      collection(db, 'vacancyEvents'),
      where('facilityId', '==', facilityId)
    );
  }

  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        facilityId: data.facilityId,
        before: data.before,
        after: data.after,
        changedBy: data.changedBy,
        changedByName: data.changedByName,
        changedAt: data.changedAt?.toDate() || new Date(),
      };
    })
    .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
    .slice(0, limitCount);
}

// ======== 初期データ ========

/**
 * 施設シードデータ（空室管理対象の介護施設のみ）
 * ※パール、シャンクレールは事務所のため除外
 */
export const FACILITIES_SEED = [
  { id: 'pacific', name: 'パシフィック', area: '介護', capacity: 22 },
  { id: 'renaissance', name: 'ルネッサンス', area: '介護', capacity: 9 },
  { id: 'serene', name: 'セレーネ', area: '介護', capacity: 9 },
];

/**
 * 施設が存在しない場合に初期データを作成
 */
export async function seedFacilitiesIfEmpty(tenantId: string = DEFAULT_TENANT_ID): Promise<void> {
  if (!db) return;

  const existing = await getFacilities(tenantId);
  if (existing.length > 0) return;

  // シードデータを作成
  for (const seed of FACILITIES_SEED) {
    const docRef = doc(db, 'facilities', seed.id);
    await setDoc(docRef, {
      name: seed.name,
      area: seed.area,
      capacity: seed.capacity,
      isActive: true,
      tenantId,
      createdAt: Timestamp.now(),
    });
  }
}

// 2026年1月時点の最新空室データ
const VACANCY_DATA: Record<string, { name: string; capacity: number; vacantCount: number; note: string }> = {
  pacific: {
    name: 'パシフィック',
    capacity: 22,
    vacantCount: 10,
    note: '210, 211, 303, 401, 406, 408, 410, 411, 416, 608が空室',
  },
  renaissance: {
    name: 'ルネッサンス',
    capacity: 9,
    vacantCount: 2,
    note: '2E, 6A(社宅予定)が空室',
  },
  serene: {
    name: 'セレーネ',
    capacity: 9,
    vacantCount: 4,
    note: '801, 813, 915, 1012が空室',
  },
};

/**
 * 空室データを最新に一括更新
 */
export async function syncVacancyData(tenantId: string = DEFAULT_TENANT_ID): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');

  for (const [facilityId, data] of Object.entries(VACANCY_DATA)) {
    // 施設のcapacityを更新
    const facilityRef = doc(db, 'facilities', facilityId);
    try {
      await setDoc(facilityRef, {
        name: data.name,
        area: '介護',
        capacity: data.capacity,
        isActive: true,
        tenantId,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    } catch (e) {
      console.error('Failed to update facility:', facilityId, e);
    }

    // 空室状態を更新
    const vacancyRef = doc(db, 'vacancyStatus', facilityId);
    await setDoc(vacancyRef, {
      facilityId,
      vacantCount: data.vacantCount,
      note: data.note,
      updatedAt: Timestamp.now(),
      updatedBy: 'system',
      updatedByName: 'システム自動更新',
    });
  }
}
