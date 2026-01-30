// ======== 共通申請エンジン Firestoreヘルパー ========

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import { db as firebaseDb } from './firebase';
import { toDate } from './date';

// Note: Google Tasks連携はサーバーサイドAPIでのみ実行される
// クライアントからは /api/google/tasks/sync APIを呼び出す

// db が undefined の場合はエラーをスロー
function getDb(): Firestore {
  if (!firebaseDb) {
    throw new Error('Firestore is not initialized');
  }
  return firebaseDb;
}
import type {
  Request,
  RequestType,
  ApprovalStatus,
  ApprovalRoute,
  ApprovalLog,
  ApprovalAction,
  ApprovalKey,
  PaymentBatch,
  PaymentItem,
  TaxType,
  UrgencyLevel,
} from '@/types/request-engine';
import { generateRequestNumber, calculateTax } from '@/types/request-engine';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== 申請（Request）========

/**
 * 新規申請を作成
 */
export async function createRequest(
  input: {
    requestType: RequestType;
    title: string;
    description: string;
    category: string;
    amount: number;
    taxType: TaxType;
    urgency?: UrgencyLevel;
    isEmergency?: boolean;
    tags?: string[];
    paymentDate?: string;
  },
  userId: string,
  userName: string,
  userBranchId: string,
  userDepartment: string
): Promise<string> {
  const { taxAmount, totalAmount } = calculateTax(input.amount, input.taxType);

  const requestData = {
    tenantId: DEFAULT_TENANT_ID,
    requestType: input.requestType,
    requestNumber: generateRequestNumber(),

    applicantId: userId,
    applicantName: userName,
    applicantDepartment: userDepartment,
    applicantBranchId: userBranchId,

    title: input.title,
    description: input.description,
    category: input.category,
    amount: input.amount,
    taxType: input.taxType,
    taxAmount,
    totalAmount,

    paymentDate: input.paymentDate ? Timestamp.fromDate(new Date(input.paymentDate)) : null,
    attachments: [],

    status: 'draft' as ApprovalStatus,
    aiVpAutoApproved: false,

    urgency: input.urgency || 'mid',
    isEmergency: input.isEmergency || false,
    relatedRequestIds: [],
    tags: input.tags || [],

    createdAt: serverTimestamp(),
    createdBy: userId,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  };

  const docRef = await addDoc(collection(getDb(), 'requests'), requestData);
  return docRef.id;
}

/**
 * 申請を取得
 */
export async function getRequest(requestId: string): Promise<Request | null> {
  const docRef = doc(getDb(), 'requests', requestId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
    submittedAt: toDate(data.submittedAt),
    completedAt: toDate(data.completedAt),
    paymentDate: toDate(data.paymentDate),
  } as Request;
}

/**
 * 申請一覧を取得
 */
export async function getRequests(
  options: {
    status?: ApprovalStatus;
    requestType?: RequestType;
    applicantId?: string;
    branchId?: string;
    limitCount?: number;
  } = {}
): Promise<Request[]> {
  const { status, requestType, applicantId, branchId, limitCount = 50 } = options;

  let q = query(
    collection(getDb(), 'requests'),
    where('tenantId', '==', DEFAULT_TENANT_ID),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  let results = snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
      submittedAt: toDate(data.submittedAt),
      completedAt: toDate(data.completedAt),
      paymentDate: toDate(data.paymentDate),
    } as Request;
  });

  // クライアントサイドフィルタリング
  if (status) {
    results = results.filter(r => r.status === status);
  }
  if (requestType) {
    results = results.filter(r => r.requestType === requestType);
  }
  if (applicantId) {
    results = results.filter(r => r.applicantId === applicantId);
  }
  if (branchId) {
    results = results.filter(r => r.applicantBranchId === branchId);
  }

  return results;
}

/**
 * 申請を更新
 */
export async function updateRequest(
  requestId: string,
  updates: Partial<Request>,
  userId: string
): Promise<void> {
  const docRef = doc(getDb(), 'requests', requestId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
}

/**
 * 申請を提出
 */
export async function submitRequest(
  requestId: string,
  userId: string,
  userName: string
): Promise<void> {
  const docRef = doc(getDb(), 'requests', requestId);
  await updateDoc(docRef, {
    status: 'submitted',
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });

  // 承認ログを記録
  await createApprovalLog(requestId, {
    action: 'submit',
    fromStatus: 'draft',
    toStatus: 'submitted',
    actorId: userId,
    actorName: userName,
    actorRole: 'applicant',
    isAiVp: false,
  });
}

// ======== 承認ルート（ApprovalRoute）========

/**
 * 承認ルートを取得
 */
export async function getApprovalRoute(routeId: string): Promise<ApprovalRoute | null> {
  const docRef = doc(getDb(), 'approvalRoutes', routeId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  } as ApprovalRoute;
}

/**
 * 申請に適用可能な承認ルートを検索
 */
export async function findApplicableApprovalRoute(
  request: Request
): Promise<ApprovalRoute | null> {
  const q = query(
    collection(getDb(), 'approvalRoutes'),
    where('tenantId', '==', DEFAULT_TENANT_ID),
    where('isActive', '==', true),
    orderBy('priority', 'asc')
  );

  const snapshot = await getDocs(q);
  const routes = snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    } as ApprovalRoute;
  });

  // 条件に一致する最初のルートを返す
  for (const route of routes) {
    const cond = route.condition;

    // 申請種別チェック
    if (cond.requestTypes && !cond.requestTypes.includes(request.requestType)) {
      continue;
    }

    // 金額チェック
    if (cond.minAmount !== undefined && request.totalAmount < cond.minAmount) {
      continue;
    }
    if (cond.maxAmount !== undefined && request.totalAmount > cond.maxAmount) {
      continue;
    }

    // ブランチチェック
    if (cond.branchIds && !cond.branchIds.includes(request.applicantBranchId)) {
      continue;
    }

    // カテゴリチェック
    if (cond.categories && !cond.categories.includes(request.category)) {
      continue;
    }

    // 緊急チェック
    if (cond.isEmergency !== undefined && cond.isEmergency !== request.isEmergency) {
      continue;
    }

    return route;
  }

  return null;
}

/**
 * 全承認ルートを取得
 */
export async function getApprovalRoutes(): Promise<ApprovalRoute[]> {
  const q = query(
    collection(getDb(), 'approvalRoutes'),
    where('tenantId', '==', DEFAULT_TENANT_ID),
    orderBy('priority', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    } as ApprovalRoute;
  });
}

/**
 * 承認ルートを作成
 */
export async function createApprovalRoute(
  input: Omit<ApprovalRoute, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const routeData = {
    ...input,
    tenantId: DEFAULT_TENANT_ID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(getDb(), 'approvalRoutes'), routeData);
  return docRef.id;
}

// ======== 承認ログ（ApprovalLog）========

/**
 * 承認ログを作成
 */
export async function createApprovalLog(
  requestId: string,
  input: {
    action: ApprovalAction;
    fromStatus: ApprovalStatus;
    toStatus: ApprovalStatus;
    actorId: string;
    actorName: string;
    actorRole: string;
    isAiVp: boolean;
    comment?: string;
    conditions?: string[];
  }
): Promise<string> {
  // 申請番号を取得
  const request = await getRequest(requestId);
  const requestNumber = request?.requestNumber || '';

  const logData = {
    tenantId: DEFAULT_TENANT_ID,
    requestId,
    requestNumber,
    ...input,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(getDb(), 'approvalLogs'), logData);
  return docRef.id;
}

/**
 * 申請の承認ログを取得
 */
export async function getApprovalLogs(requestId: string): Promise<ApprovalLog[]> {
  const q = query(
    collection(getDb(), 'approvalLogs'),
    where('requestId', '==', requestId),
    orderBy('createdAt', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: toDate(data.createdAt) || new Date(),
    } as ApprovalLog;
  });
}

// ======== 承認キー（ApprovalKey）========

/**
 * 承認キーを取得
 */
export async function getApprovalKeys(): Promise<ApprovalKey[]> {
  const q = query(
    collection(getDb(), 'approvalKeys'),
    where('tenantId', '==', DEFAULT_TENANT_ID),
    where('isActive', '==', true)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      validFrom: toDate(data.validFrom) || new Date(),
      validUntil: toDate(data.validUntil) || new Date(),
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    } as ApprovalKey;
  });
}

/**
 * 申請に適用可能な承認キーをチェック
 */
export async function checkApprovalKey(request: Request): Promise<ApprovalKey | null> {
  const keys = await getApprovalKeys();
  const now = new Date();

  for (const key of keys) {
    // 有効期間チェック
    if (now < key.validFrom || now > key.validUntil) {
      continue;
    }

    // 申請種別チェック
    if (!key.allowedTypes.includes(request.requestType)) {
      continue;
    }

    // 金額チェック
    if (request.totalAmount > key.maxAmount) {
      continue;
    }

    // スコープチェック
    if (key.scope.length > 0 && !key.scope.includes(request.applicantBranchId)) {
      continue;
    }

    // カテゴリチェック
    if (key.categories.length > 0 && !key.categories.includes(request.category)) {
      continue;
    }

    // 除外カテゴリチェック
    if (key.excludeCategories.includes(request.category)) {
      continue;
    }

    return key;
  }

  return null;
}

// ======== 支払バッチ（PaymentBatch）========

/**
 * 支払バッチを作成
 */
export async function createPaymentBatch(
  paymentDate: Date,
  userId: string
): Promise<string> {
  const { generateBatchNumber } = await import('@/types/request-engine');

  const batchData = {
    tenantId: DEFAULT_TENANT_ID,
    batchNumber: generateBatchNumber(),
    paymentDate: Timestamp.fromDate(paymentDate),
    status: 'draft',
    itemCount: 0,
    totalAmount: 0,
    totalFee: 0,
    createdAt: serverTimestamp(),
    createdBy: userId,
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(getDb(), 'paymentBatches'), batchData);
  return docRef.id;
}

/**
 * 支払バッチを取得
 */
export async function getPaymentBatch(batchId: string): Promise<PaymentBatch | null> {
  const docRef = doc(getDb(), 'paymentBatches', batchId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    paymentDate: toDate(data.paymentDate) || new Date(),
    confirmedAt: toDate(data.confirmedAt),
    transferScheduledAt: toDate(data.transferScheduledAt),
    executedAt: toDate(data.executedAt),
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  } as PaymentBatch;
}

/**
 * 支払バッチ一覧を取得
 */
export async function getPaymentBatches(limitCount: number = 20): Promise<PaymentBatch[]> {
  const q = query(
    collection(getDb(), 'paymentBatches'),
    where('tenantId', '==', DEFAULT_TENANT_ID),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      paymentDate: toDate(data.paymentDate) || new Date(),
      confirmedAt: toDate(data.confirmedAt),
      transferScheduledAt: toDate(data.transferScheduledAt),
      executedAt: toDate(data.executedAt),
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    } as PaymentBatch;
  });
}

/**
 * 支払明細を追加
 */
export async function addPaymentItem(
  batchId: string,
  item: Omit<PaymentItem, 'id' | 'batchId' | 'createdAt' | 'status'>
): Promise<string> {
  const itemData = {
    ...item,
    batchId,
    status: 'pending',
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(getDb(), 'paymentItems'), itemData);

  // バッチの集計を更新
  const batch = await getPaymentBatch(batchId);
  if (batch) {
    const batchRef = doc(getDb(), 'paymentBatches', batchId);
    await updateDoc(batchRef, {
      itemCount: batch.itemCount + 1,
      totalAmount: batch.totalAmount + item.amount,
      totalFee: batch.totalFee + item.fee,
      updatedAt: serverTimestamp(),
    });
  }

  return docRef.id;
}

/**
 * 支払バッチを確定
 */
export async function confirmPaymentBatch(
  batchId: string,
  userId: string
): Promise<void> {
  const batchRef = doc(getDb(), 'paymentBatches', batchId);
  await updateDoc(batchRef, {
    status: 'confirmed',
    confirmedAt: serverTimestamp(),
    confirmedBy: userId,
    updatedAt: serverTimestamp(),
  });
}

// ======== 承認アクション ========

/**
 * 承認を実行
 */
export async function approveRequest(
  requestId: string,
  actorId: string,
  actorName: string,
  actorRole: string,
  comment?: string
): Promise<void> {
  const request = await getRequest(requestId);
  if (!request) {
    throw new Error('申請が見つかりません');
  }

  // 次のステータスを決定
  let nextStatus: ApprovalStatus;
  switch (request.status) {
    case 'submitted':
      nextStatus = 'manager_approved';
      break;
    case 'manager_approved':
      nextStatus = 'admin_approved';
      break;
    case 'admin_approved':
      nextStatus = 'ai_vp_reviewed';
      break;
    case 'ai_vp_reviewed':
      nextStatus = 'final_approved_by_yoshida';
      break;
    case 'final_approved_by_yoshida':
      nextStatus = 'executed';
      break;
    default:
      throw new Error(`この状態からは承認できません: ${request.status}`);
  }

  // 申請を更新
  await updateRequest(requestId, {
    status: nextStatus,
    ...(nextStatus === 'executed' ? { completedAt: new Date() } : {}),
  }, actorId);

  // 承認ログを記録
  await createApprovalLog(requestId, {
    action: 'approve',
    fromStatus: request.status,
    toStatus: nextStatus,
    actorId,
    actorName,
    actorRole,
    isAiVp: actorRole === 'ai_vp',
    comment,
  });

  // Note: Google Tasks連携は呼び出し側で /api/google/tasks/sync を呼ぶ
}

/**
 * 却下を実行
 */
export async function rejectRequest(
  requestId: string,
  actorId: string,
  actorName: string,
  actorRole: string,
  comment: string
): Promise<void> {
  const request = await getRequest(requestId);
  if (!request) {
    throw new Error('申請が見つかりません');
  }

  await updateRequest(requestId, {
    status: 'rejected',
    completedAt: new Date(),
  }, actorId);

  await createApprovalLog(requestId, {
    action: 'reject',
    fromStatus: request.status,
    toStatus: 'rejected',
    actorId,
    actorName,
    actorRole,
    isAiVp: false,
    comment,
  });

  // Note: Google Tasks連携は呼び出し側で /api/google/tasks/sync を呼ぶ
}

/**
 * 差し戻しを実行
 */
export async function returnRequest(
  requestId: string,
  actorId: string,
  actorName: string,
  actorRole: string,
  comment: string
): Promise<void> {
  const request = await getRequest(requestId);
  if (!request) {
    throw new Error('申請が見つかりません');
  }

  await updateRequest(requestId, {
    status: 'returned',
  }, actorId);

  await createApprovalLog(requestId, {
    action: 'return',
    fromStatus: request.status,
    toStatus: 'returned',
    actorId,
    actorName,
    actorRole,
    isAiVp: false,
    comment,
  });
}
