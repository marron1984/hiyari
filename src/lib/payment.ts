// ======== 支払い管理ライブラリ ========

import { getAdminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getPaymentProvider } from './payment-provider';
import { createNotificationServer } from './notifications-server';
import type {
  Payment,
  PaymentStatus,
  CreatePaymentInput,
  PaymentExecutionResult,
} from '@/types/payment';

const DEFAULT_TENANT_ID = 'defaultTenant';
const PAYMENTS_COLLECTION = 'payments';
const MAX_RETRY_COUNT = 3;

// ======== ヘルパー ========

/**
 * Firestore Timestamp を Date に変換
 */
function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
}

/**
 * undefinedをフィルタしてFirestore用オブジェクトを作成
 */
function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

// ======== 支払いCRUD ========

/**
 * 支払いを作成
 */
export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  const db = getAdminDb();

  const paymentData = removeUndefined({
    tenantId: DEFAULT_TENANT_ID,
    applicationId: input.applicationId,
    applicationTitle: input.applicationTitle,
    amount: input.amount,
    currency: 'JPY',
    paymentMethod: input.paymentMethod,
    payeeName: input.payeeName,
    payeeEmail: input.payeeEmail,
    bankAccount: input.bankAccount,
    status: 'approved' as PaymentStatus, // 承認済み申請から作成されるため
    providerType: 'dummy' as const,
    retryCount: 0,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const docRef = await db.collection(PAYMENTS_COLLECTION).add(paymentData);

  return {
    id: docRef.id,
    tenantId: DEFAULT_TENANT_ID,
    applicationId: input.applicationId,
    applicationTitle: input.applicationTitle,
    amount: input.amount,
    currency: 'JPY',
    paymentMethod: input.paymentMethod,
    payeeName: input.payeeName,
    payeeEmail: input.payeeEmail,
    bankAccount: input.bankAccount,
    status: 'approved',
    providerType: 'dummy',
    retryCount: 0,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 支払いを取得
 */
export async function getPayment(paymentId: string): Promise<Payment | null> {
  const db = getAdminDb();
  const doc = await db.collection(PAYMENTS_COLLECTION).doc(paymentId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    tenantId: data.tenantId,
    applicationId: data.applicationId,
    applicationTitle: data.applicationTitle,
    amount: data.amount,
    currency: data.currency,
    paymentMethod: data.paymentMethod,
    payeeName: data.payeeName,
    payeeEmail: data.payeeEmail,
    bankAccount: data.bankAccount,
    status: data.status,
    providerType: data.providerType,
    providerTransactionId: data.providerTransactionId,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
    retryCount: data.retryCount || 0,
    lastRetryAt: toDate(data.lastRetryAt),
    approvedBy: data.approvedBy,
    approvedByName: data.approvedByName,
    approvedAt: toDate(data.approvedAt),
    completedAt: toDate(data.completedAt),
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  };
}

/**
 * 申請IDから支払いを取得
 */
export async function getPaymentByApplicationId(applicationId: string): Promise<Payment | null> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(PAYMENTS_COLLECTION)
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .where('applicationId', '==', applicationId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    tenantId: data.tenantId,
    applicationId: data.applicationId,
    applicationTitle: data.applicationTitle,
    amount: data.amount,
    currency: data.currency,
    paymentMethod: data.paymentMethod,
    payeeName: data.payeeName,
    payeeEmail: data.payeeEmail,
    bankAccount: data.bankAccount,
    status: data.status,
    providerType: data.providerType,
    providerTransactionId: data.providerTransactionId,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
    retryCount: data.retryCount || 0,
    lastRetryAt: toDate(data.lastRetryAt),
    approvedBy: data.approvedBy,
    approvedByName: data.approvedByName,
    approvedAt: toDate(data.approvedAt),
    completedAt: toDate(data.completedAt),
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  };
}

/**
 * 支払いステータスを更新
 */
export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  additionalData?: Partial<Pick<Payment, 'providerTransactionId' | 'errorCode' | 'errorMessage' | 'completedAt'>>
): Promise<void> {
  const db = getAdminDb();

  const updateData = removeUndefined({
    status,
    providerTransactionId: additionalData?.providerTransactionId,
    errorCode: additionalData?.errorCode,
    errorMessage: additionalData?.errorMessage,
    completedAt: additionalData?.completedAt ? Timestamp.fromDate(additionalData.completedAt) : undefined,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection(PAYMENTS_COLLECTION).doc(paymentId).update(updateData);
}

/**
 * リトライカウントを更新
 */
export async function incrementRetryCount(paymentId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection(PAYMENTS_COLLECTION).doc(paymentId).update({
    retryCount: FieldValue.increment(1),
    lastRetryAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ======== 支払い実行 ========

/**
 * 支払いを実行
 */
export async function executePayment(paymentId: string): Promise<PaymentExecutionResult> {
  const payment = await getPayment(paymentId);

  if (!payment) {
    return {
      success: false,
      errorCode: 'PAYMENT_NOT_FOUND',
      errorMessage: '支払いが見つかりません',
    };
  }

  // ステータスチェック
  if (payment.status !== 'approved' && payment.status !== 'failed') {
    return {
      success: false,
      errorCode: 'INVALID_STATUS',
      errorMessage: `支払いステータスが不正です: ${payment.status}`,
    };
  }

  // リトライ上限チェック
  if (payment.retryCount >= MAX_RETRY_COUNT) {
    return {
      success: false,
      errorCode: 'MAX_RETRY_EXCEEDED',
      errorMessage: 'リトライ上限に達しました',
    };
  }

  // ステータスを処理中に更新
  await updatePaymentStatus(paymentId, 'processing');

  try {
    // プロバイダーで実行
    const provider = getPaymentProvider();
    const result = await provider.execute(payment);

    if (result.success) {
      // 成功
      await updatePaymentStatus(paymentId, 'completed', {
        providerTransactionId: result.transactionId,
        completedAt: new Date(),
      });

      // 成功通知を送信
      await notifyPaymentCompleted(payment);

      return result;
    } else {
      // 失敗
      await incrementRetryCount(paymentId);
      await updatePaymentStatus(paymentId, 'failed', {
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });

      // 失敗通知を送信
      await notifyPaymentFailed(payment, result.errorMessage || '不明なエラー');

      return result;
    }
  } catch (error) {
    // 例外発生
    const errorMessage = error instanceof Error ? error.message : '不明なエラー';
    await incrementRetryCount(paymentId);
    await updatePaymentStatus(paymentId, 'failed', {
      errorCode: 'EXECUTION_ERROR',
      errorMessage,
    });

    // 失敗通知を送信
    await notifyPaymentFailed(payment, errorMessage);

    return {
      success: false,
      errorCode: 'EXECUTION_ERROR',
      errorMessage,
    };
  }
}

// ======== 失敗支払いのリトライ ========

/**
 * 失敗した支払いを取得
 */
export async function getFailedPayments(): Promise<Payment[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(PAYMENTS_COLLECTION)
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .where('status', '==', 'failed')
    .where('retryCount', '<', MAX_RETRY_COUNT)
    .orderBy('retryCount', 'asc')
    .orderBy('createdAt', 'asc')
    .limit(50)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      applicationId: data.applicationId,
      applicationTitle: data.applicationTitle,
      amount: data.amount,
      currency: data.currency,
      paymentMethod: data.paymentMethod,
      payeeName: data.payeeName,
      payeeEmail: data.payeeEmail,
      bankAccount: data.bankAccount,
      status: data.status,
      providerType: data.providerType,
      providerTransactionId: data.providerTransactionId,
      errorCode: data.errorCode,
      errorMessage: data.errorMessage,
      retryCount: data.retryCount || 0,
      lastRetryAt: toDate(data.lastRetryAt),
      approvedBy: data.approvedBy,
      approvedByName: data.approvedByName,
      approvedAt: toDate(data.approvedAt),
      completedAt: toDate(data.completedAt),
      createdBy: data.createdBy,
      createdByName: data.createdByName,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    };
  });
}

/**
 * 失敗した支払いをリトライ（バッチ処理用）
 */
export async function retryFailedPayments(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const failedPayments = await getFailedPayments();
  let succeeded = 0;
  let failed = 0;

  for (const payment of failedPayments) {
    console.log(`[Payment] リトライ開始: ${payment.id} (${payment.retryCount + 1}回目)`);
    const result = await executePayment(payment.id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return {
    total: failedPayments.length,
    succeeded,
    failed,
  };
}

// ======== 通知 ========

/**
 * 支払い完了通知を送信
 */
async function notifyPaymentCompleted(payment: Payment): Promise<void> {
  try {
    await createNotificationServer({
      tenantId: DEFAULT_TENANT_ID,
      userId: payment.createdBy,
      type: 'payment_completed',
      title: '支払いが完了しました',
      message: `${payment.payeeName}への支払い（${payment.amount.toLocaleString()}円）が完了しました`,
      actionUrl: `/dashboard/payments/${payment.id}`,
      metadata: {
        paymentId: payment.id,
        paymentAmount: payment.amount,
        payeeName: payment.payeeName,
        applicationId: payment.applicationId,
      },
    });
  } catch (error) {
    console.error('[Payment] 通知送信失敗:', error);
  }
}

/**
 * 支払い失敗通知を送信
 */
async function notifyPaymentFailed(payment: Payment, errorMessage: string): Promise<void> {
  try {
    // 申請者に通知
    await createNotificationServer({
      tenantId: DEFAULT_TENANT_ID,
      userId: payment.createdBy,
      type: 'payment_failed',
      title: '支払いに失敗しました',
      message: `${payment.payeeName}への支払い（${payment.amount.toLocaleString()}円）に失敗しました。${payment.retryCount < MAX_RETRY_COUNT ? '自動リトライを行います。' : '管理者にお問い合わせください。'}`,
      actionUrl: `/dashboard/payments/${payment.id}`,
      metadata: {
        paymentId: payment.id,
        paymentAmount: payment.amount,
        payeeName: payment.payeeName,
        applicationId: payment.applicationId,
        errorMessage,
      },
    });
  } catch (error) {
    console.error('[Payment] 通知送信失敗:', error);
  }
}
