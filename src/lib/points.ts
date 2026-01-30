// ======== ポイントモジュール API ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  increment,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { toDate } from './date';
import {
  PointHistory,
  PointReason,
  POINT_RULES,
  UserPointSummary,
  PointRankingEntry,
} from '@/types/points';
import { UserRole } from '@/types';
import { hasMinRole } from './auth';

function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ======== ポイント付与 ========

/**
 * ポイントを付与
 */
export async function awardPoints(params: {
  userId: string;
  userName: string;
  branchId: string;
  reason: PointReason;
  points?: number;         // manual_adjustの場合のみ指定
  targetId?: string;
  targetType?: string;
  description?: string;
  createdBy: string;
  createdByName: string;
  tenantId?: string;
}): Promise<PointHistory> {
  const firestore = getDb();
  const tenantId = params.tenantId || DEFAULT_TENANT_ID;

  // ポイント数を決定
  const points = params.reason === 'manual_adjust'
    ? params.points || 0
    : POINT_RULES[params.reason].points;

  // 履歴を作成
  const historyData = {
    tenantId,
    userId: params.userId,
    userName: params.userName,
    branchId: params.branchId,
    reason: params.reason,
    points,
    targetId: params.targetId || null,
    targetType: params.targetType || null,
    description: params.description || null,
    createdBy: params.createdBy,
    createdByName: params.createdByName,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'pointHistory'), historyData);

  // ユーザーの累計ポイントを更新
  await updateUserPoints(firestore, tenantId, params.userId, params.userName, params.branchId, params.reason, points);

  return {
    id: docRef.id,
    ...historyData,
    createdAt: new Date(),
  } as PointHistory;
}

/**
 * ユーザーポイントサマリーを更新
 */
async function updateUserPoints(
  firestore: ReturnType<typeof getDb>,
  tenantId: string,
  userId: string,
  userName: string,
  branchId: string,
  reason: PointReason,
  points: number
): Promise<void> {
  const summaryRef = doc(firestore, 'userPoints', `${tenantId}_${userId}`);
  const summarySnap = await getDoc(summaryRef);

  const fieldMap: Record<PointReason, string> = {
    incident_submit: 'incidentPoints',
    improvement_submit: 'improvementPoints',
    improvement_adopted: 'improvementPoints',
    ringi_approved: 'ringiPoints',
    overtime_approved: 'overtimePoints',
    manual_adjust: 'manualPoints',
  };

  const field = fieldMap[reason];

  if (summarySnap.exists()) {
    await updateDoc(summaryRef, {
      totalPoints: increment(points),
      [field]: increment(points),
      updatedAt: Timestamp.now(),
    });
  } else {
    await setDoc(summaryRef, {
      tenantId,
      userId,
      userName,
      branchId,
      totalPoints: points,
      incidentPoints: reason === 'incident_submit' ? points : 0,
      improvementPoints: ['improvement_submit', 'improvement_adopted'].includes(reason) ? points : 0,
      ringiPoints: reason === 'ringi_approved' ? points : 0,
      overtimePoints: reason === 'overtime_approved' ? points : 0,
      manualPoints: reason === 'manual_adjust' ? points : 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  // 月次サマリーも更新
  const monthKey = new Date().toISOString().slice(0, 7).replace('-', '');
  const monthlyRef = doc(firestore, 'monthlyPoints', `${tenantId}_${monthKey}_${userId}`);
  const monthlySnap = await getDoc(monthlyRef);

  if (monthlySnap.exists()) {
    await updateDoc(monthlyRef, {
      totalPoints: increment(points),
      updatedAt: Timestamp.now(),
    });
  } else {
    await setDoc(monthlyRef, {
      tenantId,
      monthKey,
      userId,
      userName,
      branchId,
      totalPoints: points,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
}

// ======== 手動調整（管理者用） ========

/**
 * 手動でポイントを調整
 */
export async function adjustPoints(params: {
  targetUserId: string;
  targetUserName: string;
  targetBranchId: string;
  points: number;
  description: string;
  adminId: string;
  adminName: string;
  adminRole: UserRole;
  tenantId?: string;
}): Promise<PointHistory> {
  // 権限チェック
  if (!hasMinRole(params.adminRole, 'admin')) {
    throw new Error('ポイント調整の権限がありません');
  }

  if (!params.description.trim()) {
    throw new Error('調整理由は必須です');
  }

  return awardPoints({
    userId: params.targetUserId,
    userName: params.targetUserName,
    branchId: params.targetBranchId,
    reason: 'manual_adjust',
    points: params.points,
    description: params.description,
    createdBy: params.adminId,
    createdByName: params.adminName,
    tenantId: params.tenantId,
  });
}

// ======== 取得 ========

/**
 * ユーザーのポイントサマリーを取得
 */
export async function getUserPointSummary(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<UserPointSummary | null> {
  const firestore = getDb();
  const summaryRef = doc(firestore, 'userPoints', `${tenantId}_${userId}`);
  const summarySnap = await getDoc(summaryRef);

  if (!summarySnap.exists()) return null;

  const data = summarySnap.data();
  return {
    userId: data.userId,
    userName: data.userName,
    branchId: data.branchId,
    totalPoints: data.totalPoints || 0,
    incidentPoints: data.incidentPoints || 0,
    improvementPoints: data.improvementPoints || 0,
    ringiPoints: data.ringiPoints || 0,
    overtimePoints: data.overtimePoints || 0,
    manualPoints: data.manualPoints || 0,
  };
}

/**
 * ユーザーのポイント履歴を取得
 */
export async function getPointHistory(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  limitCount: number = 50
): Promise<PointHistory[]> {
  const firestore = getDb();
  const q = query(
    collection(firestore, 'pointHistory'),
    where('tenantId', '==', tenantId),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: toDate(data.createdAt) || new Date(),
    } as PointHistory;
  });
}

/**
 * 全ユーザーのポイント履歴を取得（管理者用）
 */
export async function getAllPointHistory(
  tenantId: string = DEFAULT_TENANT_ID,
  limitCount: number = 100
): Promise<PointHistory[]> {
  const firestore = getDb();
  const q = query(
    collection(firestore, 'pointHistory'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: toDate(data.createdAt) || new Date(),
    } as PointHistory;
  });
}

/**
 * ポイントランキングを取得
 */
export async function getPointRanking(
  tenantId: string = DEFAULT_TENANT_ID,
  monthKey?: string,
  limitCount: number = 50
): Promise<PointRankingEntry[]> {
  const firestore = getDb();

  let results: PointRankingEntry[] = [];

  if (monthKey) {
    // 月次ランキング
    const q = query(
      collection(firestore, 'monthlyPoints'),
      where('tenantId', '==', tenantId),
      where('monthKey', '==', monthKey),
      orderBy('totalPoints', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    results = snapshot.docs.map((doc, index) => {
      const data = doc.data();
      return {
        rank: index + 1,
        userId: data.userId,
        userName: data.userName,
        branchId: data.branchId,
        totalPoints: data.totalPoints || 0,
      };
    });
  } else {
    // 累計ランキング
    const q = query(
      collection(firestore, 'userPoints'),
      where('tenantId', '==', tenantId),
      orderBy('totalPoints', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    results = snapshot.docs.map((doc, index) => {
      const data = doc.data();
      return {
        rank: index + 1,
        userId: data.userId,
        userName: data.userName,
        branchId: data.branchId,
        totalPoints: data.totalPoints || 0,
      };
    });
  }

  return results;
}

/**
 * 全ユーザーのポイントサマリーを取得（管理者用）
 */
export async function getAllUserPoints(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<UserPointSummary[]> {
  const firestore = getDb();
  const q = query(
    collection(firestore, 'userPoints'),
    where('tenantId', '==', tenantId),
    orderBy('totalPoints', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      userId: data.userId,
      userName: data.userName,
      branchId: data.branchId,
      totalPoints: data.totalPoints || 0,
      incidentPoints: data.incidentPoints || 0,
      improvementPoints: data.improvementPoints || 0,
      ringiPoints: data.ringiPoints || 0,
      overtimePoints: data.overtimePoints || 0,
      manualPoints: data.manualPoints || 0,
    };
  });
}
