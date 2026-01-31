// ======== サーバーサイド通知モジュール ========
// Firebase Admin SDK使用（APIルート専用）

import { getAdminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { NotificationType, CreateNotificationInput } from '@/types/notification';

const NOTIFICATIONS_COLLECTION = 'notifications';

// ===================
// 通知作成（サーバーサイド）
// ===================

/**
 * 通知を作成（サーバーサイド）
 */
export async function createNotificationServer(
  input: CreateNotificationInput
): Promise<string> {
  const db = getAdminDb();
  const docRef = await db.collection(NOTIFICATIONS_COLLECTION).add({
    ...input,
    read: false,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

/**
 * 複数通知を一括作成（サーバーサイド）
 */
export async function createNotificationsServer(
  inputs: CreateNotificationInput[]
): Promise<string[]> {
  if (inputs.length === 0) return [];

  const db = getAdminDb();
  const batch = db.batch();
  const docIds: string[] = [];

  for (const input of inputs) {
    const docRef = db.collection(NOTIFICATIONS_COLLECTION).doc();
    batch.set(docRef, {
      ...input,
      read: false,
      createdAt: Timestamp.now(),
    });
    docIds.push(docRef.id);
  }

  await batch.commit();
  return docIds;
}

// ===================
// 承認者検索ヘルパー
// ===================

/**
 * ロールで承認者を取得
 * 同一テナント・事業所のリーダー以上を取得
 */
export async function getApproversByRole(
  tenantId: string,
  branchId: string,
  minRole: 'leader' | 'manager' | 'admin' | 'exec'
): Promise<Array<{ id: string; name: string; role: string }>> {
  const db = getAdminDb();

  // ロール階層
  const roleHierarchy = ['user', 'leader', 'manager', 'admin', 'exec', 'owner'];
  const minRoleIndex = roleHierarchy.indexOf(minRole);

  // ユーザー取得（シンプルクエリ）
  const usersSnap = await db
    .collection('users')
    .where('tenantId', '==', tenantId)
    .get();

  const approvers: Array<{ id: string; name: string; role: string }> = [];

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const userRoleIndex = roleHierarchy.indexOf(data.role || 'user');

    // ロールチェック
    if (userRoleIndex < minRoleIndex) continue;

    // admin以上は全事業所対応、それ以下は同一事業所のみ
    if (userRoleIndex < roleHierarchy.indexOf('admin')) {
      if (data.branchId !== branchId) continue;
    }

    approvers.push({
      id: doc.id,
      name: data.name || data.email || 'Unknown',
      role: data.role,
    });
  }

  return approvers;
}

// ===================
// 申請通知ヘルパー（サーバーサイド）
// ===================

// 申請種別ラベル
const APPLICATION_TYPE_NAMES: Record<string, string> = {
  RINGI: '稟議',
  EXPENSE: '経費申請',
  OVERTIME: '残業申請',
};

/**
 * 承認待ち通知を承認者に送信
 */
export async function notifyApprovalPending(params: {
  tenantId: string;
  branchId: string;
  applicationType: 'RINGI' | 'EXPENSE' | 'OVERTIME';
  applicationId: string;
  applicantName: string;
  title: string;
  amount?: number;
}): Promise<void> {
  const { tenantId, branchId, applicationType, applicationId, applicantName, title, amount } = params;

  // 承認者を取得（リーダー以上）
  const approvers = await getApproversByRole(tenantId, branchId, 'leader');

  if (approvers.length === 0) {
    console.warn('No approvers found for notification');
    return;
  }

  const typeName = APPLICATION_TYPE_NAMES[applicationType] || '申請';
  const amountStr = amount ? `（¥${amount.toLocaleString()}）` : '';

  const notifications: CreateNotificationInput[] = approvers.map((approver) => ({
    tenantId,
    userId: approver.id,
    type: 'approval_pending' as NotificationType,
    title: `承認待ちの${typeName}があります`,
    message: `${applicantName}さんの${typeName}${amountStr}: ${title}`,
    actionUrl: applicationType === 'RINGI'
      ? `/ringi/${applicationId}`
      : `/dashboard/applications/${applicationId}`,
    metadata: { applicationId, applicationType },
  }));

  await createNotificationsServer(notifications);
}

/**
 * 承認完了通知を申請者に送信
 */
export async function notifyApplicationApproved(params: {
  tenantId: string;
  applicantId: string;
  applicationType: 'RINGI' | 'EXPENSE' | 'OVERTIME';
  applicationId: string;
  title: string;
  approverName: string;
}): Promise<void> {
  const { tenantId, applicantId, applicationType, applicationId, title, approverName } = params;

  const typeName = APPLICATION_TYPE_NAMES[applicationType] || '申請';

  await createNotificationServer({
    tenantId,
    userId: applicantId,
    type: 'application_approved',
    title: `${typeName}が承認されました`,
    message: `「${title}」が${approverName}さんに承認されました`,
    actionUrl: applicationType === 'RINGI'
      ? `/ringi/${applicationId}`
      : `/dashboard/applications/${applicationId}`,
    metadata: { applicationId, applicationType },
  });
}

/**
 * 却下通知を申請者に送信
 */
export async function notifyApplicationRejected(params: {
  tenantId: string;
  applicantId: string;
  applicationType: 'RINGI' | 'EXPENSE' | 'OVERTIME';
  applicationId: string;
  title: string;
  rejecterName: string;
  reason?: string;
}): Promise<void> {
  const { tenantId, applicantId, applicationType, applicationId, title, rejecterName, reason } = params;

  const typeName = APPLICATION_TYPE_NAMES[applicationType] || '申請';

  await createNotificationServer({
    tenantId,
    userId: applicantId,
    type: 'application_rejected',
    title: `${typeName}が却下されました`,
    message: reason
      ? `「${title}」が却下されました: ${reason}`
      : `「${title}」が${rejecterName}さんに却下されました`,
    actionUrl: applicationType === 'RINGI'
      ? `/ringi/${applicationId}`
      : `/dashboard/applications/${applicationId}`,
    metadata: { applicationId, applicationType, reason },
  });
}

/**
 * 差戻し通知を申請者に送信
 */
export async function notifyApplicationReturned(params: {
  tenantId: string;
  applicantId: string;
  applicationType: 'RINGI' | 'EXPENSE' | 'OVERTIME';
  applicationId: string;
  title: string;
  returnerName: string;
  reason?: string;
}): Promise<void> {
  const { tenantId, applicantId, applicationType, applicationId, title, returnerName, reason } = params;

  const typeName = APPLICATION_TYPE_NAMES[applicationType] || '申請';

  await createNotificationServer({
    tenantId,
    userId: applicantId,
    type: 'application_returned',
    title: `${typeName}が差戻されました`,
    message: reason
      ? `「${title}」が差戻されました: ${reason}`
      : `「${title}」が${returnerName}さんに差戻されました。修正して再申請してください`,
    actionUrl: applicationType === 'RINGI'
      ? `/ringi/${applicationId}`
      : `/dashboard/applications/${applicationId}`,
    metadata: { applicationId, applicationType, reason },
  });
}
