// ======== サーバーサイド通知モジュール ========
// Firebase Admin SDK使用（APIルート専用）

import { getAdminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  NotificationType,
  CreateNotificationInput,
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_CATEGORY_PREFERENCE,
  getCategoryForType,
  NotificationCategoryKey,
  CategoryPreference,
} from '@/types/notification';

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
// 通知設定チェック
// ===================

/**
 * ユーザーの通知設定を取得（サーバーサイド）
 */
export async function getUserNotificationPreferences(
  tenantId: string,
  userId: string
): Promise<NotificationPreferences | null> {
  const db = getAdminDb();
  const docSnap = await db
    .collection('notificationPreferences')
    .doc(`${tenantId}_${userId}`)
    .get();

  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...docSnap.data() } as NotificationPreferences;
}

/**
 * 通知タイプに対するユーザー設定を取得
 */
function getUserCategoryPref(
  prefs: NotificationPreferences | null,
  notificationType: NotificationType
): CategoryPreference {
  const category = getCategoryForType(notificationType);
  if (!category || !prefs || !prefs.categories?.[category]) {
    return DEFAULT_CATEGORY_PREFERENCE;
  }
  return prefs.categories[category];
}

/**
 * 設定を考慮した通知作成（サーバーサイド）
 *
 * ユーザーの通知設定に基づいてフィルタリング：
 * - mode='off': 通知を作成しない
 * - mode='digest': 通知を作成（digest フラグ付き）
 * - mode='immediate': 即時通知を作成
 * - channel設定に基づいてLINE WORKS送信フラグを付与
 */
export async function createNotificationWithPreferences(
  input: CreateNotificationInput
): Promise<{ id: string | null; skipped: boolean; mode: string; channel: string }> {
  const prefs = await getUserNotificationPreferences(input.tenantId, input.userId);
  const categoryPref = getUserCategoryPref(prefs, input.type);

  if (categoryPref.mode === 'off') {
    return { id: null, skipped: true, mode: 'off', channel: 'none' };
  }

  const db = getAdminDb();
  const docRef = await db.collection(NOTIFICATIONS_COLLECTION).add({
    ...input,
    read: false,
    createdAt: Timestamp.now(),
    deliveryMode: categoryPref.mode,
    deliveryChannel: categoryPref.channel,
    lineWorksEnabled: prefs?.lineWorksEnabled ?? false,
  });

  return {
    id: docRef.id,
    skipped: false,
    mode: categoryPref.mode,
    channel: categoryPref.channel,
  };
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
  PAYMENT_REQUEST: '支払い依頼',
};

/**
 * 承認待ち通知を承認者に送信
 */
export async function notifyApprovalPending(params: {
  tenantId: string;
  branchId: string;
  applicationType: 'RINGI' | 'EXPENSE' | 'OVERTIME' | 'PAYMENT_REQUEST';
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
  applicationType: 'RINGI' | 'EXPENSE' | 'OVERTIME' | 'PAYMENT_REQUEST';
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
  applicationType: 'RINGI' | 'EXPENSE' | 'OVERTIME' | 'PAYMENT_REQUEST';
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
  applicationType: 'RINGI' | 'EXPENSE' | 'OVERTIME' | 'PAYMENT_REQUEST';
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

// ===================
// AI副社長・TODO通知（サーバーサイド）
// ===================

/**
 * HIGH優先度TODOの通知を送信
 */
export async function notifyHighPriorityTodo(params: {
  tenantId: string;
  userId: string;
  todoId: string;
  title: string;
  description: string;
  source: 'OVERTIME' | 'APPROVAL' | 'SALES' | 'DOCUMENT' | 'PROSPECT';
  link: string;
}): Promise<void> {
  const { tenantId, userId, todoId, title, description, source, link } = params;

  const sourceLabels: Record<string, string> = {
    OVERTIME: '勤怠',
    APPROVAL: '承認',
    SALES: '営業',
    DOCUMENT: '書類',
    PROSPECT: '入居見込',
  };

  await createNotificationServer({
    tenantId,
    userId,
    type: 'ai_todo_high',
    title: `🚨 緊急TODO: ${sourceLabels[source] || source}`,
    message: `${title}\n${description}`,
    actionUrl: link,
    metadata: { todoId, todoSource: source },
  });
}

/**
 * HIGH優先度TODOを一括通知
 */
export async function notifyHighPriorityTodos(
  todos: Array<{
    tenantId: string;
    userId: string;
    todoId: string;
    title: string;
    description: string;
    source: 'OVERTIME' | 'APPROVAL' | 'SALES' | 'DOCUMENT' | 'PROSPECT';
    link: string;
  }>
): Promise<void> {
  if (todos.length === 0) return;

  const sourceLabels: Record<string, string> = {
    OVERTIME: '勤怠',
    APPROVAL: '承認',
    SALES: '営業',
    DOCUMENT: '書類',
    PROSPECT: '入居見込',
  };

  const notifications: CreateNotificationInput[] = todos.map((todo) => ({
    tenantId: todo.tenantId,
    userId: todo.userId,
    type: 'ai_todo_high' as NotificationType,
    title: `🚨 緊急TODO: ${sourceLabels[todo.source] || todo.source}`,
    message: `${todo.title}\n${todo.description}`,
    actionUrl: todo.link,
    metadata: { todoId: todo.todoId, todoSource: todo.source },
  }));

  await createNotificationsServer(notifications);
}
