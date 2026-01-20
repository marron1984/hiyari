// ======== デイリーインサイト Firestoreヘルパー ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { DailyInsight, InsightFormData } from '@/types/insight';
import { hasMinRole } from './auth';
import { UserRole } from '@/types';

function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ======== CRUD操作 ========

/**
 * インサイトを作成（リーダー以上）
 */
export async function createInsight(
  data: InsightFormData,
  createdBy: string,
  createdByName: string,
  userRole: UserRole,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<DailyInsight> {
  if (!hasMinRole(userRole, 'leader')) {
    throw new Error('インサイト作成にはリーダー以上の権限が必要です');
  }

  const firestore = getDb();

  const expiresAtTimestamp = data.expiresAt ? Timestamp.fromDate(new Date(data.expiresAt)) : null;

  const insightData = {
    tenantId,
    type: data.type,
    priority: data.priority,
    title: data.title,
    message: data.message,
    facilityId: data.facilityId || null,
    facilityName: null as string | null, // 後で設定可能
    actionUrl: null as string | null,
    isActive: true,
    expiresAt: expiresAtTimestamp,
    createdBy,
    createdByName,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'dailyInsights'), insightData);

  return {
    id: docRef.id,
    tenantId,
    type: data.type,
    priority: data.priority,
    title: data.title,
    message: data.message,
    facilityId: data.facilityId,
    isActive: true,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    createdBy,
    createdByName,
    createdAt: new Date(),
  };
}

/**
 * インサイトを取得
 */
export async function getInsight(id: string): Promise<DailyInsight | null> {
  const firestore = getDb();
  const docRef = doc(firestore, 'dailyInsights', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate(),
    expiresAt: data.expiresAt?.toDate(),
  } as DailyInsight;
}

/**
 * アクティブなインサイト一覧を取得
 */
export async function getActiveInsights(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<DailyInsight[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, 'dailyInsights'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);
  const now = new Date();

  const results = snapshot.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate(),
        expiresAt: data.expiresAt?.toDate(),
      } as DailyInsight;
    })
    .filter((insight) => {
      // アクティブかつ期限切れでないもの
      if (!insight.isActive) return false;
      if (insight.expiresAt && insight.expiresAt < now) return false;
      return true;
    })
    .sort((a, b) => {
      // 優先度順（high > medium > low）、同じなら新しい順
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  return results;
}

/**
 * インサイト一覧を取得（管理用、アーカイブ含む）
 */
export async function getAllInsights(
  tenantId: string = DEFAULT_TENANT_ID,
  limitCount: number = 50
): Promise<DailyInsight[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, 'dailyInsights'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);

  const results = snapshot.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate(),
        expiresAt: data.expiresAt?.toDate(),
      } as DailyInsight;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return results.slice(0, limitCount);
}

/**
 * インサイトを非アクティブ化（アーカイブ）
 */
export async function archiveInsight(
  id: string,
  userId: string,
  userRole: UserRole
): Promise<void> {
  if (!hasMinRole(userRole, 'leader')) {
    throw new Error('アーカイブにはリーダー以上の権限が必要です');
  }

  const firestore = getDb();
  await updateDoc(doc(firestore, 'dailyInsights', id), {
    isActive: false,
    updatedAt: Timestamp.now(),
  });
}

/**
 * インサイトを削除
 */
export async function deleteInsight(
  id: string,
  userId: string,
  userRole: UserRole
): Promise<void> {
  if (!hasMinRole(userRole, 'admin')) {
    throw new Error('削除には管理者権限が必要です');
  }

  const firestore = getDb();
  await deleteDoc(doc(firestore, 'dailyInsights', id));
}

// ======== 自動生成用ヘルパー（Cloud Functions用に将来使用） ========

/**
 * 空室状況からインサイトを自動生成（Phase2で使用）
 */
export function generateVacancyInsight(
  facilityName: string,
  vacantCount: number,
  capacity: number
): { type: DailyInsight['type']; priority: DailyInsight['priority']; title: string; message: string } | null {
  const occupancyRate = capacity > 0 ? Math.round(((capacity - vacantCount) / capacity) * 100) : 0;

  if (vacantCount === 0) {
    return {
      type: 'vacancy_full',
      priority: 'high',
      title: `${facilityName}満室！`,
      message: '入居先探しの問い合わせに他施設を提案しましょう',
    };
  }

  if (occupancyRate < 70) {
    return {
      type: 'low_occupancy',
      priority: 'high',
      title: `${facilityName}の稼働率${occupancyRate}%`,
      message: '入居促進のアクションを検討しましょう',
    };
  }

  if (vacantCount >= 3) {
    return {
      type: 'vacancy_available',
      priority: 'medium',
      title: `${facilityName}に${vacantCount}室の空きあり`,
      message: '入居検討中の方への提案に活用しましょう',
    };
  }

  return null;
}
