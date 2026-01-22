import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { Branch, Incident, Settings, User, MonthlyUserStats, MonthlyBranchStats, DEFAULT_SCORING_RULES } from '@/types';
import { getMonthKey } from './utils';

// ヘルパー: dbが初期化されているかチェック
function ensureDb() {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }
  return db;
}

// ======== ブランチ（事業所） ========

export async function getBranches(tenantId: string = DEFAULT_TENANT_ID): Promise<Branch[]> {
  const firestore = ensureDb();
  const q = query(collection(firestore, 'branches'), where('tenantId', '==', tenantId));
  const snapshot = await getDocs(q);
  const branches = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as Branch[];

  // 名前で重複除去（同じ名前の事業所は最初の1つのみ保持）
  // 名前を正規化（トリム、全角・半角スペースの統一）して比較
  const seen = new Set<string>();
  return branches.filter((branch) => {
    const normalizedName = branch.name.trim().replace(/\s+/g, ' ');
    if (seen.has(normalizedName)) {
      return false;
    }
    seen.add(normalizedName);
    return true;
  });
}

export async function getBranch(branchId: string): Promise<Branch | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'branches', branchId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate() || new Date(),
  } as Branch;
}

export async function createBranch(data: Omit<Branch, 'id' | 'createdAt'>): Promise<string> {
  const firestore = ensureDb();
  const docRef = await addDoc(collection(firestore, 'branches'), {
    ...data,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

// ======== 設定 ========

export async function getSettings(tenantId: string = DEFAULT_TENANT_ID): Promise<Settings | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'settings', tenantId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data(),
    updatedAt: docSnap.data().updatedAt?.toDate() || new Date(),
  } as Settings;
}

export async function initializeSettings(tenantId: string = DEFAULT_TENANT_ID): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'settings', tenantId);
  const settings: Omit<Settings, 'id'> = {
    tenantId,
    scoringRules: DEFAULT_SCORING_RULES,
    visibilityMode: 'all',
    domainAllowList: [],
    excludeFraudFromRanking: true,
    updatedAt: new Date(),
  };
  await setDoc(docRef, settings);
}

export async function updateSettings(tenantId: string, data: Partial<Settings>): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'settings', tenantId);
  await updateDoc(docRef, { ...data, updatedAt: Timestamp.now() });
}

// ======== インシデント ========

export async function createIncident(data: Omit<Incident, 'id' | 'createdAt'>): Promise<string> {
  const firestore = ensureDb();
  const batch = writeBatch(firestore);

  // undefinedの値を除外
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );

  // インシデントを作成
  const incidentRef = doc(collection(firestore, 'incidents'));
  batch.set(incidentRef, {
    ...cleanData,
    createdAt: Timestamp.now(),
  });

  // 月次統計を更新
  const monthKey = getMonthKey(new Date());
  await updateMonthlyStats(firestore, batch, data, monthKey);

  await batch.commit();
  return incidentRef.id;
}

async function updateMonthlyStats(
  firestore: ReturnType<typeof ensureDb>,
  batch: ReturnType<typeof writeBatch>,
  incident: Omit<Incident, 'id' | 'createdAt'>,
  monthKey: string
): Promise<void> {
  const tenantId = incident.tenantId;

  // ユーザー統計（フラットな構造: monthlyUserStats/{tenantId}_{monthKey}_{userId}）
  const userStatsId = `${tenantId}_${monthKey}_${incident.userId}`;
  const userStatsRef = doc(firestore, 'monthlyUserStats', userStatsId);
  const userStatsDoc = await getDoc(userStatsRef);

  if (userStatsDoc.exists()) {
    batch.update(userStatsRef, {
      points: increment(incident.scoreTotal),
      count: increment(1),
      suggestionsCount: incident.prevention ? increment(1) : increment(0),
      totalBodyLength: increment(incident.bodyLength),
    });
  } else {
    batch.set(userStatsRef, {
      tenantId,
      monthKey,
      userId: incident.userId,
      userName: incident.userName || '',
      branchId: incident.branchId,
      points: incident.scoreTotal,
      count: 1,
      suggestionsCount: incident.prevention ? 1 : 0,
      totalBodyLength: incident.bodyLength,
    });
  }

  // 事業所統計（フラットな構造: monthlyBranchStats/{tenantId}_{monthKey}_{branchId}）
  const branchStatsId = `${tenantId}_${monthKey}_${incident.branchId}`;
  const branchStatsRef = doc(firestore, 'monthlyBranchStats', branchStatsId);
  const branchStatsDoc = await getDoc(branchStatsRef);

  if (branchStatsDoc.exists()) {
    batch.update(branchStatsRef, {
      points: increment(incident.scoreTotal),
      count: increment(1),
      suggestionsCount: incident.prevention ? increment(1) : increment(0),
    });
  } else {
    // 事業所の人数を取得
    const branch = await getBranch(incident.branchId);
    batch.set(branchStatsRef, {
      tenantId,
      monthKey,
      branchId: incident.branchId,
      branchName: branch?.name || '',
      points: incident.scoreTotal,
      count: 1,
      headcount: branch?.headcount || 0,
      suggestionsCount: incident.prevention ? 1 : 0,
    });
  }
}

export async function getIncident(incidentId: string): Promise<Incident | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'incidents', incidentId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate() || new Date(),
  } as Incident;
}

export async function getIncidentsByUser(
  userId: string,
  limitCount: number = 50
): Promise<Incident[]> {
  const firestore = ensureDb();
  // シンプルなクエリ（インデックス不要）
  const q = query(
    collection(firestore, 'incidents'),
    where('userId', '==', userId),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as Incident[];

  // クライアント側でソート
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getIncidentsByTenant(
  tenantId: string = DEFAULT_TENANT_ID,
  limitCount: number = 100
): Promise<Incident[]> {
  const firestore = ensureDb();
  // シンプルなクエリ（インデックス不要）
  const q = query(
    collection(firestore, 'incidents'),
    where('tenantId', '==', tenantId),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as Incident[];

  // クライアント側でソート
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getIncidentsByMonth(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<Incident[]> {
  const firestore = ensureDb();
  // シンプルなクエリ（インデックス不要）
  const q = query(
    collection(firestore, 'incidents'),
    where('tenantId', '==', tenantId),
    limit(500)
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as Incident[];

  // クライアント側でフィルタ・ソート
  return results
    .filter((i) => i.date >= startDate && i.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ======== 月次統計 ========

export async function getMonthlyUserStats(
  tenantId: string,
  monthKey: string
): Promise<MonthlyUserStats[]> {
  const firestore = ensureDb();
  // フラットな構造: monthlyUserStats コレクションから tenantId と monthKey でフィルタ
  const q = query(
    collection(firestore, 'monthlyUserStats'),
    where('tenantId', '==', tenantId),
    where('monthKey', '==', monthKey)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      userId: data.userId,
      userName: data.userName,
      branchId: data.branchId,
      branchName: data.branchName || '',
      points: data.points || 0,
      count: data.count || 0,
      suggestionsCount: data.suggestionsCount || 0,
      totalBodyLength: data.totalBodyLength || 0,
      avgBodyLength: data.count > 0 ? Math.round(data.totalBodyLength / data.count) : 0,
    };
  });
}

export async function getMonthlyBranchStats(
  tenantId: string,
  monthKey: string
): Promise<MonthlyBranchStats[]> {
  const firestore = ensureDb();
  // フラットな構造: monthlyBranchStats コレクションから tenantId と monthKey でフィルタ
  const q = query(
    collection(firestore, 'monthlyBranchStats'),
    where('tenantId', '==', tenantId),
    where('monthKey', '==', monthKey)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      branchId: data.branchId,
      branchName: data.branchName,
      points: data.points || 0,
      count: data.count || 0,
      headcount: data.headcount || 0,
      postRate: data.headcount > 0 ? data.count / data.headcount : 0,
      suggestionsCount: data.suggestionsCount || 0,
    };
  });
}

// ======== 不正検知（簡易版） ========

export async function checkFraud(
  userId: string,
  body: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ isFraud: boolean; reason?: string }> {
  const firestore = ensureDb();
  // 過去24時間の同一ユーザーの投稿を取得（シンプルなクエリ）
  const q = query(
    collection(firestore, 'incidents'),
    where('userId', '==', userId),
    limit(20)
  );

  const snapshot = await getDocs(q);
  const recentIncidents = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate() || new Date(),
  })) as Incident[];

  // 同一本文のチェック（簡易ハッシュ: 本文の前50文字 + 長さ）
  const bodySignature = body.substring(0, 50) + body.length;
  for (const incident of recentIncidents) {
    const existingSignature = incident.body.substring(0, 50) + incident.body.length;
    if (bodySignature === existingSignature) {
      return { isFraud: true, reason: '24時間以内に同一内容の投稿が存在します' };
    }
  }

  // 短時間での大量投稿チェック（1時間以内に5件以上）
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  const recentCount = recentIncidents.filter(
    (i) => i.createdAt >= oneHourAgo
  ).length;

  if (recentCount >= 5) {
    return { isFraud: true, reason: '1時間以内に5件以上の投稿があります' };
  }

  return { isFraud: false };
}

// ======== ユーザー ========

export async function getUser(userId: string): Promise<User | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'users', userId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate() || new Date(),
  } as User;
}

export async function getUsers(tenantId: string = DEFAULT_TENANT_ID): Promise<User[]> {
  const firestore = ensureDb();
  const q = query(
    collection(firestore, 'users'),
    where('tenantId', '==', tenantId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate() || new Date(),
  } as User)).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
