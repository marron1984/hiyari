// ======== Google Tasks 連携ライブラリ ========
// 吉田最終決裁タスクをGoogle Tasksに同期

import { google } from 'googleapis';
import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { toDate } from './date';
import type { TaskSyncRecord, TaskSyncType } from '@/types/request-engine';

const DEFAULT_TENANT_ID = 'defaultTenant';

// Google OAuth2クライアント設定
const GOOGLE_CLIENT_ID = process.env.GOOGLE_TASKS_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_TASKS_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_TASKS_REDIRECT_URI || 'http://localhost:3000/api/google/callback';

// 吉田用のリフレッシュトークン（事前に取得してenv変数に保存）
const YOSHIDA_REFRESH_TOKEN = process.env.YOSHIDA_GOOGLE_REFRESH_TOKEN;

// デフォルトのタスクリストID（@defaultを使用）
const DEFAULT_TASK_LIST_ID = '@default';

/**
 * OAuth2クライアントを取得
 */
function getOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('Google Tasks credentials not configured');
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  if (YOSHIDA_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: YOSHIDA_REFRESH_TOKEN,
    });
  }

  return oauth2Client;
}

/**
 * Google Tasks APIクライアントを取得
 */
function getTasksClient() {
  const auth = getOAuth2Client();
  if (!auth) return null;

  return google.tasks({ version: 'v1', auth });
}

/**
 * 承認待ちタスクを作成
 */
export async function createApprovalTask(
  requestId: string,
  requestNumber: string,
  title: string,
  amount: number,
  applicantName: string,
  dueDate?: Date
): Promise<TaskSyncRecord | null> {
  const tasks = getTasksClient();
  if (!tasks) {
    console.warn('Google Tasks client not available');
    return null;
  }

  try {
    const taskTitle = `【最終決裁】${requestNumber}: ${title}`;
    const taskNotes = [
      `申請者: ${applicantName}`,
      `金額: ¥${amount.toLocaleString()}`,
      ``,
      `DHPハブで詳細を確認:`,
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://dhp.aska-g.com'}/requests/${requestId}`,
    ].join('\n');

    const taskData: {
      title: string;
      notes: string;
      due?: string;
    } = {
      title: taskTitle,
      notes: taskNotes,
    };

    // 期限がある場合は設定
    if (dueDate) {
      taskData.due = dueDate.toISOString();
    }

    const response = await tasks.tasks.insert({
      tasklist: DEFAULT_TASK_LIST_ID,
      requestBody: taskData,
    });

    const googleTaskId = response.data.id;
    if (!googleTaskId) {
      throw new Error('Failed to get task ID from Google Tasks');
    }

    // 同期記録を保存
    const syncRecord: Omit<TaskSyncRecord, 'id'> = {
      tenantId: DEFAULT_TENANT_ID,
      requestId,
      taskType: 'pending_final_approval' as TaskSyncType,
      googleTaskId,
      googleTaskListId: DEFAULT_TASK_LIST_ID,
      taskTitle,
      taskNotes,
      dueDate: dueDate || undefined,
      isCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await getAdminDb().collection('taskSyncRecords').add({
      ...syncRecord,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      id: docRef.id,
      ...syncRecord,
    };
  } catch (error) {
    console.error('Failed to create Google Task:', error);
    return null;
  }
}

/**
 * タスクを完了にする
 */
export async function completeApprovalTask(requestId: string): Promise<boolean> {
  const tasks = getTasksClient();
  if (!tasks) {
    console.warn('Google Tasks client not available');
    return false;
  }

  try {
    // 同期記録を検索
    const snapshot = await getAdminDb()
      .collection('taskSyncRecords')
      .where('requestId', '==', requestId)
      .where('isCompleted', '==', false)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log('No pending task sync record found for request:', requestId);
      return true; // タスクがない場合は成功扱い
    }

    const syncDoc = snapshot.docs[0];
    const syncData = syncDoc.data();

    // Google Tasksでタスクを完了にする
    await tasks.tasks.patch({
      tasklist: syncData.googleTaskListId || DEFAULT_TASK_LIST_ID,
      task: syncData.googleTaskId,
      requestBody: {
        status: 'completed',
      },
    });

    // 同期記録を更新
    await syncDoc.ref.update({
      isCompleted: true,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error('Failed to complete Google Task:', error);
    return false;
  }
}

/**
 * タスクを削除する
 */
export async function deleteApprovalTask(requestId: string): Promise<boolean> {
  const tasks = getTasksClient();
  if (!tasks) {
    console.warn('Google Tasks client not available');
    return false;
  }

  try {
    // 同期記録を検索
    const snapshot = await getAdminDb()
      .collection('taskSyncRecords')
      .where('requestId', '==', requestId)
      .where('isCompleted', '==', false)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return true; // タスクがない場合は成功扱い
    }

    const syncDoc = snapshot.docs[0];
    const syncData = syncDoc.data();

    // Google Tasksからタスクを削除
    await tasks.tasks.delete({
      tasklist: syncData.googleTaskListId || DEFAULT_TASK_LIST_ID,
      task: syncData.googleTaskId,
    });

    // 同期記録を削除
    await syncDoc.ref.delete();

    return true;
  } catch (error) {
    console.error('Failed to delete Google Task:', error);
    return false;
  }
}

/**
 * 未完了の同期タスク一覧を取得
 */
export async function getPendingTaskSyncRecords(limitCount: number = 50): Promise<TaskSyncRecord[]> {
  const snapshot = await getAdminDb()
    .collection('taskSyncRecords')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .where('isCompleted', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(limitCount)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      requestId: data.requestId,
      taskType: data.taskType,
      googleTaskId: data.googleTaskId,
      googleTaskListId: data.googleTaskListId,
      taskTitle: data.taskTitle,
      taskNotes: data.taskNotes,
      dueDate: toDate(data.dueDate),
      isCompleted: data.isCompleted,
      completedAt: toDate(data.completedAt),
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    } as TaskSyncRecord;
  });
}

/**
 * Google Tasks認証URLを生成
 */
export function getAuthUrl(): string | null {
  const client = getOAuth2Client();
  if (!client) return null;

  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/tasks'],
    prompt: 'consent',
  });
}

/**
 * 認証コードからトークンを取得
 */
export async function getTokensFromCode(code: string): Promise<{ refresh_token?: string | null } | null> {
  const client = getOAuth2Client();
  if (!client) return null;

  try {
    const { tokens } = await client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Failed to get tokens:', error);
    return null;
  }
}

/**
 * Google Tasks連携が設定されているかチェック
 */
export function isGoogleTasksConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && YOSHIDA_REFRESH_TOKEN);
}
