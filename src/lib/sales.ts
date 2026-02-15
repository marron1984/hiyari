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
  orderBy,
  Timestamp,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { toDate } from './date';
import {
  SalesAccount,
  SalesAccountFormData,
  SalesDeal,
  SalesDealFormData,
  SalesDealStatus,
  StatusHistoryEntry,
  PipelineSummary,
  SALES_DEAL_STATUSES,
} from '@/types/sales';

// ヘルパー: dbが初期化されているかチェック
function ensureDb() {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }
  return db;
}

// ======== 営業先（SalesAccount） ========

// 営業先一覧取得
export async function getSalesAccounts(tenantId: string = DEFAULT_TENANT_ID): Promise<SalesAccount[]> {
  const firestore = ensureDb();
  const q = query(
    collection(firestore, 'salesAccounts'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: toDate(doc.data().createdAt) || new Date(),
    updatedAt: toDate(doc.data().updatedAt),
  })) as SalesAccount[];
}

// 営業先取得（単一）
export async function getSalesAccount(accountId: string): Promise<SalesAccount | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'salesAccounts', accountId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: toDate(docSnap.data().createdAt) || new Date(),
    updatedAt: toDate(docSnap.data().updatedAt),
  } as SalesAccount;
}

// 営業先作成
export async function createSalesAccount(
  data: SalesAccountFormData,
  createdBy: string,
  createdByName: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<string> {
  const firestore = ensureDb();
  const docRef = await addDoc(collection(firestore, 'salesAccounts'), {
    ...data,
    tenantId,
    totalDeals: 0,
    activeDeals: 0,
    completedDeals: 0,
    createdAt: Timestamp.now(),
    createdBy,
    createdByName,
  });
  return docRef.id;
}

// 営業先更新
export async function updateSalesAccount(
  accountId: string,
  data: Partial<SalesAccountFormData>
): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'salesAccounts', accountId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// 営業先削除
export async function deleteSalesAccount(accountId: string): Promise<void> {
  const firestore = ensureDb();
  // 関連する案件があるかチェック
  const dealsQuery = query(
    collection(firestore, 'salesDeals'),
    where('accountId', '==', accountId)
  );
  const dealsSnapshot = await getDocs(dealsQuery);
  if (!dealsSnapshot.empty) {
    throw new Error('この営業先には案件が紐付いているため削除できません');
  }
  await deleteDoc(doc(firestore, 'salesAccounts', accountId));
}

// ======== 案件（SalesDeal） ========

// 案件一覧取得
export async function getSalesDeals(
  tenantId: string = DEFAULT_TENANT_ID,
  filters?: {
    accountId?: string;
    status?: SalesDealStatus;
    assignedToId?: string;
  }
): Promise<SalesDeal[]> {
  const firestore = ensureDb();
  let q = query(
    collection(firestore, 'salesDeals'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  let deals = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: toDate(doc.data().createdAt) || new Date(),
    updatedAt: toDate(doc.data().updatedAt),
    statusHistory: (doc.data().statusHistory || []).map((h: { changedAt: unknown }) => ({
      ...h,
      changedAt: toDate(h.changedAt) || new Date(),
    })),
  })) as SalesDeal[];

  // フィルタリング（クライアント側）
  if (filters?.accountId) {
    deals = deals.filter((d) => d.accountId === filters.accountId);
  }
  if (filters?.status) {
    deals = deals.filter((d) => d.status === filters.status);
  }
  if (filters?.assignedToId) {
    deals = deals.filter((d) => d.assignedToId === filters.assignedToId);
  }

  return deals;
}

// 案件取得（単一）
export async function getSalesDeal(dealId: string): Promise<SalesDeal | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'salesDeals', dealId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt),
    statusHistory: (data.statusHistory || []).map((h: { changedAt: unknown }) => ({
      ...h,
      changedAt: toDate(h.changedAt) || new Date(),
    })),
  } as SalesDeal;
}

// 案件作成
export async function createSalesDeal(
  data: SalesDealFormData,
  createdBy: string,
  createdByName: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<string> {
  const firestore = ensureDb();
  const batch = writeBatch(firestore);

  // 営業先を取得 or 新規作成
  let account: SalesAccount | null = null;
  let accountId = data.accountId;

  if (accountId) {
    account = await getSalesAccount(accountId);
    if (!account) {
      throw new Error('営業先が見つかりません');
    }
  } else if (data.accountName?.trim()) {
    // 新規営業先を自動作成
    accountId = await createSalesAccount(
      {
        name: data.accountName.trim(),
        type: data.accountType || 'その他',
      },
      createdBy,
      createdByName,
      tenantId
    );
    account = { id: accountId, name: data.accountName.trim() } as SalesAccount;
    // formDataのaccountIdを更新
    data = { ...data, accountId };
  } else {
    throw new Error('営業先を入力してください');
  }

  // 初期ステータス履歴
  const initialHistory: StatusHistoryEntry = {
    status: data.status,
    changedAt: new Date(),
    changedBy: createdBy,
    changedByName: createdByName,
    note: '案件作成',
  };

  // 案件作成
  const dealRef = doc(collection(firestore, 'salesDeals'));
  batch.set(dealRef, {
    ...data,
    accountName: account.name,
    tenantId,
    statusHistory: [initialHistory],
    createdAt: Timestamp.now(),
    createdBy,
    createdByName,
  });

  // 営業先の統計更新
  const accountRef = doc(firestore, 'salesAccounts', data.accountId);
  batch.update(accountRef, {
    totalDeals: increment(1),
    activeDeals: increment(1),
    updatedAt: Timestamp.now(),
  });

  await batch.commit();
  return dealRef.id;
}

// 案件更新
export async function updateSalesDeal(
  dealId: string,
  data: Partial<SalesDealFormData & {
    actualMoveInDate?: string;
    invoiceDate?: string;
    invoiceAmount?: number;
    followUpCount?: number;
    lastFollowUpDate?: string;
    nextFollowUpDate?: string;
    followUpHistory?: {
      count: number;
      date: string;
      note?: string;
      result?: '継続' | '成約' | '保留' | '失注';
    }[];
  }>
): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'salesDeals', dealId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// ステータス更新（履歴付き）
export async function updateDealStatus(
  dealId: string,
  newStatus: SalesDealStatus,
  changedBy: string,
  changedByName: string,
  note?: string
): Promise<void> {
  const firestore = ensureDb();
  const deal = await getSalesDeal(dealId);
  if (!deal) {
    throw new Error('案件が見つかりません');
  }

  const oldStatus = deal.status;
  const batch = writeBatch(firestore);

  // ステータス履歴エントリ
  const historyEntry: StatusHistoryEntry = {
    status: newStatus,
    changedAt: new Date(),
    changedBy,
    changedByName,
    note,
  };

  // 案件更新
  const dealRef = doc(firestore, 'salesDeals', dealId);
  batch.update(dealRef, {
    status: newStatus,
    statusHistory: [...deal.statusHistory, historyEntry],
    updatedAt: Timestamp.now(),
  });

  // 営業先の統計更新
  const accountRef = doc(firestore, 'salesAccounts', deal.accountId);
  const isOldActive = !['請求書到着', '失注'].includes(oldStatus);
  const isNewActive = !['請求書到着', '失注'].includes(newStatus);
  const isNewCompleted = newStatus === '請求書到着';
  const wasCompleted = oldStatus === '請求書到着';

  if (isOldActive && !isNewActive) {
    batch.update(accountRef, { activeDeals: increment(-1) });
  } else if (!isOldActive && isNewActive) {
    batch.update(accountRef, { activeDeals: increment(1) });
  }

  if (isNewCompleted && !wasCompleted) {
    batch.update(accountRef, { completedDeals: increment(1) });
  } else if (wasCompleted && !isNewCompleted) {
    batch.update(accountRef, { completedDeals: increment(-1) });
  }

  await batch.commit();
}

// 案件削除
export async function deleteSalesDeal(dealId: string): Promise<void> {
  const firestore = ensureDb();
  const deal = await getSalesDeal(dealId);
  if (!deal) {
    throw new Error('案件が見つかりません');
  }

  const batch = writeBatch(firestore);

  // 案件削除
  batch.delete(doc(firestore, 'salesDeals', dealId));

  // 営業先の統計更新
  const accountRef = doc(firestore, 'salesAccounts', deal.accountId);
  const isActive = !['請求書到着', '失注'].includes(deal.status);
  const isCompleted = deal.status === '請求書到着';

  batch.update(accountRef, {
    totalDeals: increment(-1),
    ...(isActive && { activeDeals: increment(-1) }),
    ...(isCompleted && { completedDeals: increment(-1) }),
    updatedAt: Timestamp.now(),
  });

  await batch.commit();
}

// ======== 集計・レポート ========

// パイプライン集計
export async function getPipelineSummary(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<PipelineSummary[]> {
  const deals = await getSalesDeals(tenantId);

  return SALES_DEAL_STATUSES.map((status) => {
    const statusDeals = deals.filter((d) => d.status === status);
    return {
      status,
      count: statusDeals.length,
      deals: statusDeals,
    };
  });
}

// 担当者別の案件数取得
export async function getDealsByAssignee(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ assignedToId: string; assignedToName: string; count: number; deals: SalesDeal[] }[]> {
  const deals = await getSalesDeals(tenantId);

  const byAssignee: Record<string, { assignedToId: string; assignedToName: string; deals: SalesDeal[] }> = {};

  deals.forEach((deal) => {
    const key = deal.assignedToId || 'unassigned';
    if (!byAssignee[key]) {
      byAssignee[key] = {
        assignedToId: deal.assignedToId || '',
        assignedToName: deal.assignedToName || '未割当',
        deals: [],
      };
    }
    byAssignee[key].deals.push(deal);
  });

  return Object.values(byAssignee).map((item) => ({
    ...item,
    count: item.deals.length,
  }));
}

// 停滞案件の取得
export async function getStaleDeals(
  tenantId: string = DEFAULT_TENANT_ID,
  staleDays: number = 7
): Promise<SalesDeal[]> {
  const deals = await getSalesDeals(tenantId);
  const now = new Date();

  return deals.filter((deal) => {
    if (['請求書到着', '失注'].includes(deal.status)) return false;

    const lastActivity = deal.updatedAt || deal.createdAt;
    const daysSinceActivity = Math.floor(
      (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceActivity >= staleDays;
  });
}
