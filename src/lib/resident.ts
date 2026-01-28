// ======== 入居者管理 Firestore関数 ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import {
  Resident,
  ResidentFilter,
  ResidentWithDocStats,
  ResidentStatus,
  calculateAge,
  getDaysUntilBirthday,
} from '@/types/resident';
import { getDocuments } from './document';

function ensureDb() {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }
  return db;
}

// ======== 入居者取得 ========

export async function getResidents(
  tenantId: string = DEFAULT_TENANT_ID,
  filter?: ResidentFilter
): Promise<Resident[]> {
  const firestore = ensureDb();

  let q = query(
    collection(firestore, 'residents'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);

  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      birthDate: data.birthDate?.toDate(),
      moveInDate: data.moveInDate?.toDate(),
      moveOutPlannedDate: data.moveOutPlannedDate?.toDate(),
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      syncedAt: data.syncedAt?.toDate(),
    } as Resident;
  });

  // フィルタリング
  if (filter) {
    if (filter.facilityId) {
      results = results.filter((r) => r.facilityId === filter.facilityId);
    }
    if (filter.status) {
      results = results.filter((r) => r.status === filter.status);
    }
    if (filter.birthMonth) {
      results = results.filter((r) => {
        if (!r.birthDate) return false;
        const bd = r.birthDate instanceof Date ? r.birthDate : new Date(r.birthDate);
        return bd.getMonth() + 1 === filter.birthMonth;
      });
    }
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      results = results.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) ||
          r.nameKana?.toLowerCase().includes(searchLower) ||
          r.facilityName?.toLowerCase().includes(searchLower) ||
          r.roomNumber?.toLowerCase().includes(searchLower)
      );
    }
  }

  return results;
}

export async function getResident(id: string): Promise<Resident | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'residents', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    birthDate: data.birthDate?.toDate(),
    moveInDate: data.moveInDate?.toDate(),
    moveOutPlannedDate: data.moveOutPlannedDate?.toDate(),
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate(),
    syncedAt: data.syncedAt?.toDate(),
  } as Resident;
}

// ======== 入居者 + 書類統計 ========

export async function getResidentsWithDocStats(
  tenantId: string = DEFAULT_TENANT_ID,
  filter?: ResidentFilter,
  birthdayDays: number = 30
): Promise<ResidentWithDocStats[]> {
  const residents = await getResidents(tenantId, filter);

  // 全書類を一括取得（パフォーマンス向上のため）
  const allDocs = await getDocuments(tenantId, { ownerType: 'RESIDENT' });

  // 入居者IDごとにグループ化
  const docsByOwner: Record<string, typeof allDocs> = {};
  for (const d of allDocs) {
    if (!docsByOwner[d.ownerId]) {
      docsByOwner[d.ownerId] = [];
    }
    docsByOwner[d.ownerId].push(d);
  }

  return residents.map((r) => {
    const docs = docsByOwner[r.id] || [];
    const docStats = {
      total: docs.length,
      missing: docs.filter((d) => d.status === 'MISSING').length,
      submitted: docs.filter((d) => d.status === 'SUBMITTED').length,
      expired: docs.filter((d) => d.status === 'EXPIRED').length,
    };

    const birthDateObj = r.birthDate
      ? (r.birthDate instanceof Date ? r.birthDate : new Date(r.birthDate))
      : null;
    const daysUntilBirthday = birthDateObj ? getDaysUntilBirthday(birthDateObj) : undefined;
    const upcomingBirthday = daysUntilBirthday !== undefined && daysUntilBirthday <= birthdayDays;

    return {
      ...r,
      docStats,
      upcomingBirthday,
      daysUntilBirthday,
    };
  });
}

// ======== 入居者作成・更新 ========

export async function createResident(
  data: Omit<Resident, 'id' | 'createdAt' | 'updatedAt'>,
  actorId: string
): Promise<Resident> {
  const firestore = ensureDb();

  const toDate = (d: Date | string | undefined): Date | null => {
    if (!d) return null;
    return d instanceof Date ? d : new Date(d);
  };

  const residentData = {
    ...data,
    birthDate: toDate(data.birthDate) ? Timestamp.fromDate(toDate(data.birthDate)!) : null,
    moveInDate: toDate(data.moveInDate) ? Timestamp.fromDate(toDate(data.moveInDate)!) : null,
    moveOutPlannedDate: toDate(data.moveOutPlannedDate) ? Timestamp.fromDate(toDate(data.moveOutPlannedDate)!) : null,
    createdAt: Timestamp.now(),
    createdBy: actorId,
  };

  const docRef = await addDoc(collection(firestore, 'residents'), residentData);

  return {
    id: docRef.id,
    ...data,
    createdAt: new Date(),
  } as Resident;
}

export async function updateResident(
  id: string,
  updates: Partial<Resident>,
  actorId: string
): Promise<void> {
  const firestore = ensureDb();

  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };

  // Date型をTimestampに変換
  const toDateObj = (d: Date | string | undefined): Date | null => {
    if (!d) return null;
    return d instanceof Date ? d : new Date(d);
  };

  if (updates.birthDate) {
    const bd = toDateObj(updates.birthDate);
    if (bd) updateData.birthDate = Timestamp.fromDate(bd);
  }
  if (updates.moveInDate) {
    const mid = toDateObj(updates.moveInDate);
    if (mid) updateData.moveInDate = Timestamp.fromDate(mid);
  }
  if (updates.moveOutPlannedDate) {
    const mopd = toDateObj(updates.moveOutPlannedDate);
    if (mopd) updateData.moveOutPlannedDate = Timestamp.fromDate(mopd);
  }

  await updateDoc(doc(firestore, 'residents', id), updateData);
}

// ======== 誕生日リスト ========

export async function getUpcomingBirthdays(
  tenantId: string = DEFAULT_TENANT_ID,
  days: number = 30
): Promise<{ residents: ResidentWithDocStats[]; employees: unknown[] }> {
  // 入居者の誕生日
  const residentsWithStats = await getResidentsWithDocStats(tenantId, undefined, days);
  const upcomingResidents = residentsWithStats
    .filter((r) => r.upcomingBirthday && r.status === '入居中')
    .sort((a, b) => (a.daysUntilBirthday || 999) - (b.daysUntilBirthday || 999));

  // TODO: 従業員の誕生日も取得

  return {
    residents: upcomingResidents,
    employees: [],
  };
}

// ======== サマリー ========

export async function getResidentSummary(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{
  total: number;
  active: number;
  plannedMoveout: number;
  inactive: number;
  byFacility: Record<string, number>;
}> {
  const residents = await getResidents(tenantId);

  const active = residents.filter((r) => r.status === '入居中').length;
  const plannedMoveout = residents.filter((r) => r.status === '退去予定').length;
  const inactive = residents.filter((r) => r.status === '退去済').length;

  const byFacility: Record<string, number> = {};
  for (const r of residents.filter((r) => r.status === '入居中')) {
    const facility = r.facilityName || '未設定';
    byFacility[facility] = (byFacility[facility] || 0) + 1;
  }

  return {
    total: residents.length,
    active,
    plannedMoveout,
    inactive,
    byFacility,
  };
}
