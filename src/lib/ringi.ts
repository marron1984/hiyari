// ======== 稟議モジュール API ========

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
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import {
  Ringi,
  RingiFormData,
  RingiStatus,
  RingiAction,
  RingiAuditLog,
  canTransition,
  canEdit,
  canDelete,
  UserRole,
} from '@/types';

// Firestoreが初期化されているか確認
function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ======== CRUD操作 ========

/**
 * 稟議を作成（下書き状態）
 */
export async function createRingi(
  data: RingiFormData,
  authorId: string,
  authorName: string,
  branchId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<Ringi> {
  const firestore = getDb();

  const ringiData = {
    tenantId,
    branchId,
    authorId,
    authorName,
    title: data.title,
    category: data.category,
    amount: data.amount || null,
    description: data.description,
    attachmentUrls: [],
    status: 'draft' as RingiStatus,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'ringis'), ringiData);

  // 監査ログ
  await addAuditLog({
    tenantId,
    ringiId: docRef.id,
    action: 'create',
    toStatus: 'draft',
    performedBy: authorId,
    performedByName: authorName,
  });

  return {
    id: docRef.id,
    ...ringiData,
    createdAt: new Date(),
  } as Ringi;
}

/**
 * 稟議を取得
 */
export async function getRingi(ringiId: string): Promise<Ringi | null> {
  const firestore = getDb();
  const docRef = doc(firestore, 'ringis', ringiId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate(),
    submittedAt: data.submittedAt?.toDate(),
    approvedAt: data.approvedAt?.toDate(),
    rejectedAt: data.rejectedAt?.toDate(),
  } as Ringi;
}

/**
 * 稟議を更新（draft状態のみ）
 */
export async function updateRingi(
  ringiId: string,
  data: Partial<RingiFormData>,
  userId: string,
  userName: string
): Promise<Ringi> {
  const firestore = getDb();
  const ringi = await getRingi(ringiId);

  if (!ringi) {
    throw new Error('稟議が見つかりません');
  }

  if (!canEdit(ringi, userId)) {
    throw new Error('この稟議を編集する権限がありません（下書き状態の作成者のみ編集可能）');
  }

  const updateData: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };

  if (data.title !== undefined) updateData.title = data.title;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.description !== undefined) updateData.description = data.description;

  await updateDoc(doc(firestore, 'ringis', ringiId), updateData);

  // 監査ログ
  await addAuditLog({
    tenantId: ringi.tenantId,
    ringiId,
    action: 'update',
    performedBy: userId,
    performedByName: userName,
  });

  return (await getRingi(ringiId))!;
}

/**
 * 稟議を削除（draft状態のみ）
 */
export async function deleteRingi(
  ringiId: string,
  userId: string
): Promise<void> {
  const firestore = getDb();
  const ringi = await getRingi(ringiId);

  if (!ringi) {
    throw new Error('稟議が見つかりません');
  }

  if (!canDelete(ringi, userId)) {
    throw new Error('この稟議を削除する権限がありません（下書き状態の作成者のみ削除可能）');
  }

  await deleteDoc(doc(firestore, 'ringis', ringiId));
}

// ======== 状態遷移 ========

/**
 * 稟議を申請（draft → submitted）
 */
export async function submitRingi(
  ringiId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  userBranchId: string
): Promise<Ringi> {
  return await transitionStatus(
    ringiId,
    'submit',
    userId,
    userName,
    userRole,
    userBranchId
  );
}

/**
 * 稟議を承認（submitted → approved）
 */
export async function approveRingi(
  ringiId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  userBranchId: string,
  comment?: string
): Promise<Ringi> {
  return await transitionStatus(
    ringiId,
    'approve',
    userId,
    userName,
    userRole,
    userBranchId,
    comment
  );
}

/**
 * 稟議を却下（submitted → rejected）
 */
export async function rejectRingi(
  ringiId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  userBranchId: string,
  reason: string
): Promise<Ringi> {
  if (!reason.trim()) {
    throw new Error('却下理由は必須です');
  }
  return await transitionStatus(
    ringiId,
    'reject',
    userId,
    userName,
    userRole,
    userBranchId,
    reason
  );
}

/**
 * 稟議を取り下げ（submitted → draft）
 */
export async function withdrawRingi(
  ringiId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  userBranchId: string
): Promise<Ringi> {
  return await transitionStatus(
    ringiId,
    'withdraw',
    userId,
    userName,
    userRole,
    userBranchId
  );
}

/**
 * 状態遷移の共通処理
 */
async function transitionStatus(
  ringiId: string,
  action: RingiAction,
  userId: string,
  userName: string,
  userRole: UserRole,
  userBranchId: string,
  commentOrReason?: string
): Promise<Ringi> {
  const firestore = getDb();
  const ringi = await getRingi(ringiId);

  if (!ringi) {
    throw new Error('稟議が見つかりません');
  }

  // 権限チェック
  if (!canTransition(ringi, action, userId, userRole, userBranchId)) {
    throw new Error(`この操作を実行する権限がありません: ${action}`);
  }

  const fromStatus = ringi.status;
  let toStatus: RingiStatus;
  const updateData: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };

  switch (action) {
    case 'submit':
      toStatus = 'submitted';
      updateData.status = toStatus;
      updateData.submittedAt = Timestamp.now();
      break;

    case 'approve':
      toStatus = 'approved';
      updateData.status = toStatus;
      updateData.approvedBy = userId;
      updateData.approvedByName = userName;
      updateData.approvedAt = Timestamp.now();
      if (commentOrReason) {
        updateData.approvalComment = commentOrReason;
      }
      break;

    case 'reject':
      toStatus = 'rejected';
      updateData.status = toStatus;
      updateData.rejectedBy = userId;
      updateData.rejectedByName = userName;
      updateData.rejectedAt = Timestamp.now();
      updateData.rejectionReason = commentOrReason;
      break;

    case 'withdraw':
      toStatus = 'draft';
      updateData.status = toStatus;
      // 申請日時をクリア
      updateData.submittedAt = null;
      break;

    default:
      throw new Error(`不明なアクション: ${action}`);
  }

  await updateDoc(doc(firestore, 'ringis', ringiId), updateData);

  // 監査ログ
  await addAuditLog({
    tenantId: ringi.tenantId,
    ringiId,
    action,
    fromStatus,
    toStatus,
    performedBy: userId,
    performedByName: userName,
    comment: commentOrReason,
  });

  return (await getRingi(ringiId))!;
}

// ======== 一覧取得 ========

/**
 * ユーザーの稟議一覧を取得
 */
export async function getRingisByUser(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  limitCount: number = 50
): Promise<Ringi[]> {
  const firestore = getDb();
  const q = query(
    collection(firestore, 'ringis'),
    where('tenantId', '==', tenantId),
    where('authorId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      submittedAt: data.submittedAt?.toDate(),
      approvedAt: data.approvedAt?.toDate(),
      rejectedAt: data.rejectedAt?.toDate(),
    } as Ringi;
  });
}

/**
 * 承認待ち稟議一覧を取得（管理者用）
 */
export async function getPendingRingis(
  tenantId: string = DEFAULT_TENANT_ID,
  branchId?: string,
  limitCount: number = 100
): Promise<Ringi[]> {
  const firestore = getDb();

  let q;
  if (branchId) {
    // leaderは自事業所のみ
    q = query(
      collection(firestore, 'ringis'),
      where('tenantId', '==', tenantId),
      where('branchId', '==', branchId),
      where('status', '==', 'submitted'),
      orderBy('submittedAt', 'asc'),
      limit(limitCount)
    );
  } else {
    // adminは全件
    q = query(
      collection(firestore, 'ringis'),
      where('tenantId', '==', tenantId),
      where('status', '==', 'submitted'),
      orderBy('submittedAt', 'asc'),
      limit(limitCount)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      submittedAt: data.submittedAt?.toDate(),
      approvedAt: data.approvedAt?.toDate(),
      rejectedAt: data.rejectedAt?.toDate(),
    } as Ringi;
  });
}

/**
 * 全稟議一覧を取得（管理者用）
 */
export async function getAllRingis(
  tenantId: string = DEFAULT_TENANT_ID,
  branchId?: string,
  status?: RingiStatus,
  limitCount: number = 100
): Promise<Ringi[]> {
  const firestore = getDb();

  let q = query(
    collection(firestore, 'ringis'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  // フィルタ条件を追加
  if (branchId) {
    q = query(
      collection(firestore, 'ringis'),
      where('tenantId', '==', tenantId),
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
  }

  const snapshot = await getDocs(q);
  let results = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      submittedAt: data.submittedAt?.toDate(),
      approvedAt: data.approvedAt?.toDate(),
      rejectedAt: data.rejectedAt?.toDate(),
    } as Ringi;
  });

  // クライアント側でstatusフィルタ
  if (status) {
    results = results.filter((r) => r.status === status);
  }

  return results;
}

// ======== 監査ログ ========

async function addAuditLog(data: Omit<RingiAuditLog, 'id' | 'createdAt'>): Promise<void> {
  const firestore = getDb();
  await addDoc(collection(firestore, 'ringiAuditLogs'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

/**
 * 稟議の監査ログを取得
 */
export async function getRingiAuditLogs(
  ringiId: string,
  limitCount: number = 50
): Promise<RingiAuditLog[]> {
  const firestore = getDb();
  const q = query(
    collection(firestore, 'ringiAuditLogs'),
    where('ringiId', '==', ringiId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as RingiAuditLog;
  });
}
