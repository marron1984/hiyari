// ======== 共通申請モジュール API ========
// 経費申請（EXPENSE）・残業申請（OVERTIME）のCRUD・状態遷移

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
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { UserRole } from '@/types';
import { RingiStatus } from '@/types/ringi';
import {
  Application,
  ApplicationType,
  ApplicationAction,
  ApplicationAuditLog,
  ExpensePayload,
  OvertimePayload,
  ExpenseFormData,
  OvertimeFormData,
  ExpenseApplication,
  OvertimeApplication,
  isApplicationAuthor,
  canEditApplication,
  canDeleteApplication,
  canApproveApplication,
  generateApplicationTitle,
  calculateOvertimeHours,
} from '@/types/application';

// Firestoreコレクション名
const COLLECTION_NAME = 'applications';
const AUDIT_LOG_COLLECTION = 'applicationAuditLogs';

// Firestoreが初期化されているか確認
function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ======== 経費申請 CRUD ========

/**
 * 経費申請を作成（下書き状態）
 */
export async function createExpenseApplication(
  data: ExpenseFormData,
  authorId: string,
  authorName: string,
  branchId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<ExpenseApplication> {
  const firestore = getDb();

  const payload: ExpensePayload = {
    expenseDate: data.expenseDate,
    amount: typeof data.amount === 'number' ? data.amount : 0,
    category: data.category as ExpensePayload['category'],
    paymentMethod: data.paymentMethod as ExpensePayload['paymentMethod'],
    description: data.description,
    receiptUrls: data.receiptUrls || [],
    vendor: data.vendor || undefined,
    taxAmount: typeof data.taxAmount === 'number' ? data.taxAmount : undefined,
    purpose: data.purpose || undefined,
    participants: data.participants?.split(',').map((s) => s.trim()).filter(Boolean) || undefined,
    projectCode: data.projectCode || undefined,
  };

  const title = generateApplicationTitle('EXPENSE', payload, authorName);

  const applicationData = {
    tenantId,
    branchId,
    type: 'EXPENSE' as ApplicationType,
    authorId,
    authorName,
    title,
    payload,
    amount: payload.amount,
    status: 'draft' as RingiStatus,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, COLLECTION_NAME), applicationData);

  // 監査ログ
  await addApplicationAuditLog({
    tenantId,
    applicationId: docRef.id,
    applicationType: 'EXPENSE',
    action: 'create',
    toStatus: 'draft',
    performedBy: authorId,
    performedByName: authorName,
  });

  return {
    id: docRef.id,
    ...applicationData,
    createdAt: new Date(),
  } as ExpenseApplication;
}

/**
 * 経費申請を更新（draft状態のみ）
 */
export async function updateExpenseApplication(
  applicationId: string,
  data: Partial<ExpenseFormData>,
  userId: string,
  userName: string
): Promise<ExpenseApplication> {
  const firestore = getDb();
  const application = await getApplication(applicationId);

  if (!application) {
    throw new Error('申請が見つかりません');
  }

  if (application.type !== 'EXPENSE') {
    throw new Error('経費申請ではありません');
  }

  if (!canEditApplication(application, userId)) {
    throw new Error('この申請を編集する権限がありません（下書き状態の作成者のみ編集可能）');
  }

  const currentPayload = application.payload as ExpensePayload;
  const newPayload: ExpensePayload = {
    ...currentPayload,
    ...(data.expenseDate !== undefined && { expenseDate: data.expenseDate }),
    ...(data.amount !== undefined && data.amount !== '' && { amount: data.amount as number }),
    ...(data.category !== undefined && data.category !== '' && { category: data.category as ExpensePayload['category'] }),
    ...(data.paymentMethod !== undefined && data.paymentMethod !== '' && { paymentMethod: data.paymentMethod as ExpensePayload['paymentMethod'] }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.receiptUrls !== undefined && { receiptUrls: data.receiptUrls }),
    ...(data.vendor !== undefined && { vendor: data.vendor || undefined }),
    ...(data.purpose !== undefined && { purpose: data.purpose || undefined }),
    ...(data.projectCode !== undefined && { projectCode: data.projectCode || undefined }),
  };

  const updateData: Record<string, unknown> = {
    payload: newPayload,
    amount: newPayload.amount,
    title: generateApplicationTitle('EXPENSE', newPayload, application.authorName),
    updatedAt: Timestamp.now(),
  };

  await updateDoc(doc(firestore, COLLECTION_NAME, applicationId), updateData);

  // 監査ログ
  await addApplicationAuditLog({
    tenantId: application.tenantId,
    applicationId,
    applicationType: 'EXPENSE',
    action: 'update',
    performedBy: userId,
    performedByName: userName,
  });

  return (await getApplication(applicationId)) as ExpenseApplication;
}

// ======== 残業申請 CRUD ========

/**
 * 残業申請を作成（下書き状態）
 */
export async function createOvertimeApplication(
  data: OvertimeFormData,
  authorId: string,
  authorName: string,
  branchId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<OvertimeApplication> {
  const firestore = getDb();

  const hours = calculateOvertimeHours(data.startTime, data.endTime);

  const payload: OvertimePayload = {
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    hours,
    reason: data.reason as OvertimePayload['reason'],
    reasonDetail: data.reasonDetail || undefined,
    workContent: data.workContent || undefined,
    isHoliday: data.isHoliday || false,
    isNightShift: data.isNightShift || false,
  };

  const title = generateApplicationTitle('OVERTIME', payload, authorName);

  const applicationData = {
    tenantId,
    branchId,
    type: 'OVERTIME' as ApplicationType,
    authorId,
    authorName,
    title,
    payload,
    status: 'draft' as RingiStatus,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, COLLECTION_NAME), applicationData);

  // 監査ログ
  await addApplicationAuditLog({
    tenantId,
    applicationId: docRef.id,
    applicationType: 'OVERTIME',
    action: 'create',
    toStatus: 'draft',
    performedBy: authorId,
    performedByName: authorName,
  });

  return {
    id: docRef.id,
    ...applicationData,
    createdAt: new Date(),
  } as OvertimeApplication;
}

/**
 * 残業申請を更新（draft状態のみ）
 */
export async function updateOvertimeApplication(
  applicationId: string,
  data: Partial<OvertimeFormData>,
  userId: string,
  userName: string
): Promise<OvertimeApplication> {
  const firestore = getDb();
  const application = await getApplication(applicationId);

  if (!application) {
    throw new Error('申請が見つかりません');
  }

  if (application.type !== 'OVERTIME') {
    throw new Error('残業申請ではありません');
  }

  if (!canEditApplication(application, userId)) {
    throw new Error('この申請を編集する権限がありません（下書き状態の作成者のみ編集可能）');
  }

  const currentPayload = application.payload as OvertimePayload;
  const startTime = data.startTime !== undefined ? data.startTime : currentPayload.startTime;
  const endTime = data.endTime !== undefined ? data.endTime : currentPayload.endTime;
  const hours = calculateOvertimeHours(startTime, endTime);

  const newPayload: OvertimePayload = {
    ...currentPayload,
    ...(data.date !== undefined && { date: data.date }),
    ...(data.startTime !== undefined && { startTime: data.startTime }),
    ...(data.endTime !== undefined && { endTime: data.endTime }),
    hours,
    ...(data.reason !== undefined && data.reason !== '' && { reason: data.reason as OvertimePayload['reason'] }),
    ...(data.reasonDetail !== undefined && { reasonDetail: data.reasonDetail || undefined }),
    ...(data.workContent !== undefined && { workContent: data.workContent || undefined }),
    ...(data.isHoliday !== undefined && { isHoliday: data.isHoliday }),
    ...(data.isNightShift !== undefined && { isNightShift: data.isNightShift }),
  };

  const updateData: Record<string, unknown> = {
    payload: newPayload,
    title: generateApplicationTitle('OVERTIME', newPayload, application.authorName),
    updatedAt: Timestamp.now(),
  };

  await updateDoc(doc(firestore, COLLECTION_NAME, applicationId), updateData);

  // 監査ログ
  await addApplicationAuditLog({
    tenantId: application.tenantId,
    applicationId,
    applicationType: 'OVERTIME',
    action: 'update',
    performedBy: userId,
    performedByName: userName,
  });

  return (await getApplication(applicationId)) as OvertimeApplication;
}

// ======== 共通 CRUD ========

/**
 * 申請を取得
 */
export async function getApplication(applicationId: string): Promise<Application | null> {
  const firestore = getDb();
  const docRef = doc(firestore, COLLECTION_NAME, applicationId);
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
    returnedAt: data.returnedAt?.toDate(),
  } as Application;
}

/**
 * 申請を削除（draft状態のみ）
 */
export async function deleteApplication(
  applicationId: string,
  userId: string
): Promise<void> {
  const firestore = getDb();
  const application = await getApplication(applicationId);

  if (!application) {
    throw new Error('申請が見つかりません');
  }

  if (!canDeleteApplication(application, userId)) {
    throw new Error('この申請を削除する権限がありません（下書き状態の作成者のみ削除可能）');
  }

  await deleteDoc(doc(firestore, COLLECTION_NAME, applicationId));
}

// ======== 状態遷移 ========

/**
 * 申請を提出（draft → submitted）
 */
export async function submitApplication(
  applicationId: string,
  userId: string,
  userName: string
): Promise<Application> {
  const firestore = getDb();
  const application = await getApplication(applicationId);

  if (!application) {
    throw new Error('申請が見つかりません');
  }

  if (application.status !== 'draft') {
    throw new Error('下書き状態の申請のみ提出できます');
  }

  if (!isApplicationAuthor(application, userId)) {
    throw new Error('作成者のみ申請を提出できます');
  }

  const fromStatus = application.status;
  const toStatus: RingiStatus = 'submitted';

  await updateDoc(doc(firestore, COLLECTION_NAME, applicationId), {
    status: toStatus,
    submittedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // 監査ログ
  await addApplicationAuditLog({
    tenantId: application.tenantId,
    applicationId,
    applicationType: application.type,
    action: 'submit',
    fromStatus,
    toStatus,
    performedBy: userId,
    performedByName: userName,
  });

  return (await getApplication(applicationId))!;
}

/**
 * 申請を承認（submitted → approved）
 */
export async function approveApplication(
  applicationId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  userBranchId: string,
  comment?: string
): Promise<Application> {
  const firestore = getDb();
  const application = await getApplication(applicationId);

  if (!application) {
    throw new Error('申請が見つかりません');
  }

  if (!canApproveApplication(application, userId, userRole, userBranchId)) {
    throw new Error('この申請を承認する権限がありません');
  }

  const fromStatus = application.status;
  const toStatus: RingiStatus = 'approved';

  const updateData: Record<string, unknown> = {
    status: toStatus,
    approvedBy: userId,
    approvedByName: userName,
    approvedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  if (comment) {
    updateData.approvalComment = comment;
  }

  await updateDoc(doc(firestore, COLLECTION_NAME, applicationId), updateData);

  // 監査ログ
  await addApplicationAuditLog({
    tenantId: application.tenantId,
    applicationId,
    applicationType: application.type,
    action: 'approve',
    fromStatus,
    toStatus,
    performedBy: userId,
    performedByName: userName,
    comment,
  });

  return (await getApplication(applicationId))!;
}

/**
 * 申請を却下（submitted → rejected）
 */
export async function rejectApplication(
  applicationId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  userBranchId: string,
  reason: string
): Promise<Application> {
  const firestore = getDb();
  const application = await getApplication(applicationId);

  if (!application) {
    throw new Error('申請が見つかりません');
  }

  if (!reason.trim()) {
    throw new Error('却下理由は必須です');
  }

  if (!canApproveApplication(application, userId, userRole, userBranchId)) {
    throw new Error('この申請を却下する権限がありません');
  }

  const fromStatus = application.status;
  const toStatus: RingiStatus = 'rejected';

  await updateDoc(doc(firestore, COLLECTION_NAME, applicationId), {
    status: toStatus,
    rejectedBy: userId,
    rejectedByName: userName,
    rejectedAt: Timestamp.now(),
    rejectionReason: reason,
    updatedAt: Timestamp.now(),
  });

  // 監査ログ
  await addApplicationAuditLog({
    tenantId: application.tenantId,
    applicationId,
    applicationType: application.type,
    action: 'reject',
    fromStatus,
    toStatus,
    performedBy: userId,
    performedByName: userName,
    comment: reason,
  });

  return (await getApplication(applicationId))!;
}

/**
 * 申請を差戻し（submitted → returned）
 */
export async function returnApplication(
  applicationId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  userBranchId: string,
  reason: string
): Promise<Application> {
  const firestore = getDb();
  const application = await getApplication(applicationId);

  if (!application) {
    throw new Error('申請が見つかりません');
  }

  if (!reason.trim()) {
    throw new Error('差戻し理由は必須です');
  }

  if (!canApproveApplication(application, userId, userRole, userBranchId)) {
    throw new Error('この申請を差戻しする権限がありません');
  }

  const fromStatus = application.status;
  const toStatus: RingiStatus = 'returned';

  await updateDoc(doc(firestore, COLLECTION_NAME, applicationId), {
    status: toStatus,
    returnedBy: userId,
    returnedByName: userName,
    returnedAt: Timestamp.now(),
    returnReason: reason,
    updatedAt: Timestamp.now(),
  });

  // 監査ログ
  await addApplicationAuditLog({
    tenantId: application.tenantId,
    applicationId,
    applicationType: application.type,
    action: 'return',
    fromStatus,
    toStatus,
    performedBy: userId,
    performedByName: userName,
    comment: reason,
  });

  return (await getApplication(applicationId))!;
}

/**
 * 申請を取り下げ（submitted → draft）
 */
export async function withdrawApplication(
  applicationId: string,
  userId: string,
  userName: string
): Promise<Application> {
  const firestore = getDb();
  const application = await getApplication(applicationId);

  if (!application) {
    throw new Error('申請が見つかりません');
  }

  if (application.status !== 'submitted') {
    throw new Error('承認待ち状態の申請のみ取り下げできます');
  }

  if (!isApplicationAuthor(application, userId)) {
    throw new Error('作成者のみ申請を取り下げできます');
  }

  const fromStatus = application.status;
  const toStatus: RingiStatus = 'draft';

  await updateDoc(doc(firestore, COLLECTION_NAME, applicationId), {
    status: toStatus,
    submittedAt: null,
    updatedAt: Timestamp.now(),
  });

  // 監査ログ
  await addApplicationAuditLog({
    tenantId: application.tenantId,
    applicationId,
    applicationType: application.type,
    action: 'withdraw',
    fromStatus,
    toStatus,
    performedBy: userId,
    performedByName: userName,
  });

  return (await getApplication(applicationId))!;
}

/**
 * 差戻し後に再提出（returned → submitted）
 */
export async function resubmitApplication(
  applicationId: string,
  userId: string,
  userName: string
): Promise<Application> {
  const firestore = getDb();
  const application = await getApplication(applicationId);

  if (!application) {
    throw new Error('申請が見つかりません');
  }

  if (application.status !== 'returned') {
    throw new Error('差戻し状態の申請のみ再提出できます');
  }

  if (!isApplicationAuthor(application, userId)) {
    throw new Error('作成者のみ申請を再提出できます');
  }

  const fromStatus = application.status;
  const toStatus: RingiStatus = 'submitted';

  await updateDoc(doc(firestore, COLLECTION_NAME, applicationId), {
    status: toStatus,
    submittedAt: Timestamp.now(),
    // 差戻し情報はクリアしない（履歴として保持）
    updatedAt: Timestamp.now(),
  });

  // 監査ログ
  await addApplicationAuditLog({
    tenantId: application.tenantId,
    applicationId,
    applicationType: application.type,
    action: 'submit',
    fromStatus,
    toStatus,
    performedBy: userId,
    performedByName: userName,
  });

  return (await getApplication(applicationId))!;
}

// ======== 一覧取得 ========

/**
 * ユーザーの申請一覧を取得
 */
export async function getApplicationsByUser(
  userId: string,
  applicationType?: ApplicationType,
  tenantId: string = DEFAULT_TENANT_ID,
  limitCount: number = 50
): Promise<Application[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, COLLECTION_NAME),
    where('authorId', '==', userId),
    limit(limitCount * 2)
  );

  const snapshot = await getDocs(q);
  let results = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      submittedAt: data.submittedAt?.toDate(),
      approvedAt: data.approvedAt?.toDate(),
      rejectedAt: data.rejectedAt?.toDate(),
      returnedAt: data.returnedAt?.toDate(),
    } as Application;
  });

  // クライアント側でフィルタ
  if (applicationType) {
    results = results.filter((a) => a.type === applicationType);
  }

  // 新しい順にソート
  return results
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
}

/**
 * 承認待ち申請一覧を取得（管理者用）
 */
export async function getPendingApplications(
  applicationType?: ApplicationType,
  branchId?: string,
  tenantId: string = DEFAULT_TENANT_ID,
  limitCount: number = 100
): Promise<Application[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, COLLECTION_NAME),
    where('status', '==', 'submitted'),
    limit(limitCount * 2)
  );

  const snapshot = await getDocs(q);
  let results = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      submittedAt: data.submittedAt?.toDate(),
      approvedAt: data.approvedAt?.toDate(),
      rejectedAt: data.rejectedAt?.toDate(),
      returnedAt: data.returnedAt?.toDate(),
    } as Application;
  });

  // クライアント側でフィルタ
  if (applicationType) {
    results = results.filter((a) => a.type === applicationType);
  }
  if (branchId) {
    results = results.filter((a) => a.branchId === branchId);
  }

  // 古い順（先に申請されたものを優先）
  return results
    .sort((a, b) => {
      const aTime = a.submittedAt?.getTime() || 0;
      const bTime = b.submittedAt?.getTime() || 0;
      return aTime - bTime;
    })
    .slice(0, limitCount);
}

/**
 * 全申請一覧を取得（管理者用）
 */
export async function getAllApplications(
  applicationType?: ApplicationType,
  branchId?: string,
  status?: RingiStatus,
  tenantId: string = DEFAULT_TENANT_ID,
  limitCount: number = 100
): Promise<Application[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, COLLECTION_NAME),
    limit(limitCount * 3)
  );

  const snapshot = await getDocs(q);
  let results = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      submittedAt: data.submittedAt?.toDate(),
      approvedAt: data.approvedAt?.toDate(),
      rejectedAt: data.rejectedAt?.toDate(),
      returnedAt: data.returnedAt?.toDate(),
    } as Application;
  });

  // クライアント側でフィルタ
  if (applicationType) {
    results = results.filter((a) => a.type === applicationType);
  }
  if (branchId) {
    results = results.filter((a) => a.branchId === branchId);
  }
  if (status) {
    results = results.filter((a) => a.status === status);
  }

  // 新しい順
  return results
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
}

// ======== 監査ログ ========

async function addApplicationAuditLog(
  data: Omit<ApplicationAuditLog, 'id' | 'createdAt'>
): Promise<void> {
  const firestore = getDb();
  // undefinedの値を除外
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );
  await addDoc(collection(firestore, AUDIT_LOG_COLLECTION), {
    ...cleanData,
    createdAt: Timestamp.now(),
  });
}

/**
 * 申請の監査ログを取得
 */
export async function getApplicationAuditLogs(
  applicationId: string,
  limitCount: number = 50
): Promise<ApplicationAuditLog[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, AUDIT_LOG_COLLECTION),
    where('applicationId', '==', applicationId),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  const results = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as ApplicationAuditLog;
  });

  // 新しい順
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ======== 集計 ========

/**
 * 月別の経費合計を取得
 */
export async function getMonthlyExpenseTotal(
  year: number,
  month: number,
  branchId?: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ total: number; count: number; byCategory: Record<string, number> }> {
  const applications = await getAllApplications('EXPENSE', branchId, 'approved', tenantId, 500);

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  const monthlyApplications = applications.filter((a) => {
    const payload = a.payload as ExpensePayload;
    return payload.expenseDate >= startDate && payload.expenseDate <= endDate;
  });

  const byCategory: Record<string, number> = {};
  let total = 0;

  for (const app of monthlyApplications) {
    const payload = app.payload as ExpensePayload;
    total += payload.amount;
    byCategory[payload.category] = (byCategory[payload.category] || 0) + payload.amount;
  }

  return {
    total,
    count: monthlyApplications.length,
    byCategory,
  };
}

/**
 * 月別の残業時間合計を取得
 */
export async function getMonthlyOvertimeTotal(
  year: number,
  month: number,
  branchId?: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ totalHours: number; count: number; byUser: Record<string, number> }> {
  const applications = await getAllApplications('OVERTIME', branchId, 'approved', tenantId, 500);

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  const monthlyApplications = applications.filter((a) => {
    const payload = a.payload as OvertimePayload;
    return payload.date >= startDate && payload.date <= endDate;
  });

  const byUser: Record<string, number> = {};
  let totalHours = 0;

  for (const app of monthlyApplications) {
    const payload = app.payload as OvertimePayload;
    totalHours += payload.hours;
    byUser[app.authorName] = (byUser[app.authorName] || 0) + payload.hours;
  }

  return {
    totalHours,
    count: monthlyApplications.length,
    byUser,
  };
}
