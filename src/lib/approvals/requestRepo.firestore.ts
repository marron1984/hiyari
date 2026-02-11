/**
 * 承認申請 Firestoreリポジトリ
 *
 * PROD-003: 本番永続化
 *
 * コレクション: approval_requests, approval_actions
 * 申請インスタンスとアクション（監査ログ）の管理
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  ApprovalRequest,
  ApprovalAction,
  CreateApprovalRequestRequest,
  ApprovalRequestFilter,
  ApprovalRequestListItem,
  ActionType,
} from './types';
import { getApprovalFlow } from './flowRepo.firestore';
import { selectFlowForRequest } from './selectFlow';

// ========== 定数 ==========

const REQUESTS_COLLECTION = 'approval_requests';
const ACTIONS_COLLECTION = 'approval_actions';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateActionId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ========== コンバーター ==========

function docToRequest(doc: FirebaseFirestore.DocumentSnapshot): ApprovalRequest {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    requestType: data.requestType ?? 'generic',
    entityId: data.entityId ?? null,
    requesterUserId: data.requesterUserId ?? '',
    requesterUserName: data.requesterUserName,
    flowId: data.flowId ?? '',
    flowName: data.flowName,
    status: data.status ?? 'draft',
    currentStepOrder: data.currentStepOrder ?? 0,
    title: data.title ?? '',
    summary: data.summary ?? null,
    metaJson: data.metaJson ?? null,
    submittedAt: data.submittedAt ?? null,
    decidedAt: data.decidedAt ?? null,
    dueAt: data.dueAt ?? null,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToAction(doc: FirebaseFirestore.DocumentSnapshot): ApprovalAction {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    requestId: data.requestId ?? '',
    stepOrder: data.stepOrder ?? 0,
    actorUserId: data.actorUserId ?? '',
    actorUserName: data.actorUserName,
    action: data.action ?? 'comment',
    note: data.note ?? null,
    createdAt: data.createdAt ?? now(),
  };
}

// ========================================
// 申請操作
// ========================================

/**
 * 申請一覧取得
 */
export async function listApprovalRequests(filter: ApprovalRequestFilter = {}): Promise<{
  requests: ApprovalRequestListItem[];
  total: number;
}> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(REQUESTS_COLLECTION);

  if (filter.requestType) {
    q = q.where('requestType', '==', filter.requestType);
  }
  if (filter.status) {
    q = q.where('status', '==', filter.status);
  }
  if (filter.requesterUserId) {
    q = q.where('requesterUserId', '==', filter.requesterUserId);
  }

  const snapshot = await q.get();
  let requests = snapshot.docs.map(docToRequest);

  const total = requests.length;

  // ソート（更新日時降順）
  requests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  requests = requests.slice(offset, offset + limit);

  // 現ステップ情報を付加
  const items: ApprovalRequestListItem[] = [];
  for (const r of requests) {
    const flow = await getApprovalFlow(r.flowId);
    const currentStep = flow?.steps.find((s) => s.stepOrder === r.currentStepOrder);
    items.push({
      ...r,
      currentStepInfo: currentStep
        ? {
            approverType: currentStep.approverType,
            approverRole: currentStep.approverRole,
            approverUserId: currentStep.approverUserId,
          }
        : undefined,
    });
  }

  return { requests: items, total };
}

/**
 * 申請取得
 */
export async function getApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
  const db = getAdminDb();
  const doc = await db.collection(REQUESTS_COLLECTION).doc(requestId).get();
  if (!doc.exists) return null;
  return docToRequest(doc);
}

/**
 * 申請作成（draft）
 */
export async function createApprovalRequest(
  data: CreateApprovalRequestRequest,
  requesterUserId: string,
  requesterUserName?: string
): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
  // フロー選択（selectFlow uses listApprovalFlows which is now async）
  const flowResult = await selectFlowForRequest(data.requestType, data.meta);
  if (!flowResult.flow) {
    return {
      success: false,
      error: flowResult.reason ?? '適用可能なフローが見つかりません',
    };
  }

  const db = getAdminDb();
  const timestamp = now();
  const requestId = generateRequestId();

  const request: ApprovalRequest = {
    id: requestId,
    requestType: data.requestType,
    entityId: data.entityId ?? null,
    requesterUserId,
    requesterUserName,
    flowId: flowResult.flow.id,
    flowName: flowResult.flow.name,
    status: 'draft',
    currentStepOrder: 0,
    title: data.title,
    summary: data.summary ?? null,
    metaJson: data.meta ?? null,
    submittedAt: null,
    decidedAt: null,
    dueAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(REQUESTS_COLLECTION).doc(requestId).set(request);

  return { success: true, request };
}

/**
 * 申請提出（draft → pending）
 */
export async function submitApprovalRequest(
  requestId: string,
  actorUserId: string,
  actorUserName?: string
): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '申請が見つかりません' };
  }

  const request = docToRequest(doc);

  if (request.status !== 'draft') {
    return { success: false, error: 'draft状態の申請のみ提出可能です' };
  }

  if (request.requesterUserId !== actorUserId) {
    return { success: false, error: '申請者本人のみ提出可能です' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'pending',
    currentStepOrder: 1,
    submittedAt: timestamp,
    updatedAt: timestamp,
  });

  const updated: ApprovalRequest = {
    ...request,
    status: 'pending',
    currentStepOrder: 1,
    submittedAt: timestamp,
    updatedAt: timestamp,
  };

  // アクション記録
  await recordAction(requestId, 0, actorUserId, 'submit', null, actorUserName);

  return { success: true, request: updated };
}

/**
 * 承認
 */
export async function approveRequest(
  requestId: string,
  actorUserId: string,
  note?: string,
  actorUserName?: string
): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '申請が見つかりません' };
  }

  const request = docToRequest(doc);

  if (request.status !== 'pending') {
    return { success: false, error: 'pending状態の申請のみ承認可能です' };
  }

  const flow = await getApprovalFlow(request.flowId);
  if (!flow) {
    return { success: false, error: 'フローが見つかりません' };
  }

  const timestamp = now();
  const currentStepOrder = request.currentStepOrder;
  const nextStepOrder = currentStepOrder + 1;
  const hasNextStep = flow.steps.some((s) => s.stepOrder === nextStepOrder);

  // アクション記録
  await recordAction(requestId, currentStepOrder, actorUserId, 'approve', note ?? null, actorUserName);

  if (hasNextStep) {
    // 次ステップへ
    await docRef.update({
      currentStepOrder: nextStepOrder,
      updatedAt: timestamp,
    });
    const updated: ApprovalRequest = {
      ...request,
      currentStepOrder: nextStepOrder,
      updatedAt: timestamp,
    };
    return { success: true, request: updated };
  } else {
    // 最終承認
    await docRef.update({
      status: 'approved',
      decidedAt: timestamp,
      updatedAt: timestamp,
    });
    const updated: ApprovalRequest = {
      ...request,
      status: 'approved',
      decidedAt: timestamp,
      updatedAt: timestamp,
    };
    return { success: true, request: updated };
  }
}

/**
 * 却下
 */
export async function rejectRequest(
  requestId: string,
  actorUserId: string,
  note?: string,
  actorUserName?: string
): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '申請が見つかりません' };
  }

  const request = docToRequest(doc);

  if (request.status !== 'pending') {
    return { success: false, error: 'pending状態の申請のみ却下可能です' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'rejected',
    decidedAt: timestamp,
    updatedAt: timestamp,
  });

  const updated: ApprovalRequest = {
    ...request,
    status: 'rejected',
    decidedAt: timestamp,
    updatedAt: timestamp,
  };

  // アクション記録
  await recordAction(requestId, request.currentStepOrder, actorUserId, 'reject', note ?? null, actorUserName);

  return { success: true, request: updated };
}

/**
 * 差戻し
 */
export async function returnRequest(
  requestId: string,
  actorUserId: string,
  note?: string,
  actorUserName?: string
): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '申請が見つかりません' };
  }

  const request = docToRequest(doc);

  if (request.status !== 'pending') {
    return { success: false, error: 'pending状態の申請のみ差戻し可能です' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'returned',
    updatedAt: timestamp,
  });

  const updated: ApprovalRequest = {
    ...request,
    status: 'returned',
    updatedAt: timestamp,
  };

  // アクション記録
  await recordAction(requestId, request.currentStepOrder, actorUserId, 'return', note ?? null, actorUserName);

  return { success: true, request: updated };
}

/**
 * 取消（申請者のみ、draft/pending のみ）
 */
export async function cancelRequest(
  requestId: string,
  actorUserId: string,
  actorUserName?: string
): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '申請が見つかりません' };
  }

  const request = docToRequest(doc);

  if (request.requesterUserId !== actorUserId) {
    return { success: false, error: '申請者本人のみ取消可能です' };
  }

  if (request.status !== 'draft' && request.status !== 'pending') {
    return { success: false, error: 'draft/pending状態の申請のみ取消可能です' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'cancelled',
    updatedAt: timestamp,
  });

  const updated: ApprovalRequest = {
    ...request,
    status: 'cancelled',
    updatedAt: timestamp,
  };

  // アクション記録
  await recordAction(requestId, request.currentStepOrder, actorUserId, 'cancel', null, actorUserName);

  return { success: true, request: updated };
}

// ========================================
// アクション（監査ログ）操作
// ========================================

/**
 * アクション記録
 */
async function recordAction(
  requestId: string,
  stepOrder: number,
  actorUserId: string,
  action: ActionType,
  note: string | null,
  actorUserName?: string
): Promise<ApprovalAction> {
  const db = getAdminDb();
  const actionId = generateActionId();
  const timestamp = now();

  const actionRecord: ApprovalAction = {
    id: actionId,
    requestId,
    stepOrder,
    actorUserId,
    actorUserName,
    action,
    note,
    createdAt: timestamp,
  };

  await db.collection(ACTIONS_COLLECTION).doc(actionId).set(actionRecord);

  return actionRecord;
}

/**
 * コメント追加
 */
export async function addComment(
  requestId: string,
  actorUserId: string,
  note: string,
  actorUserName?: string
): Promise<{ success: boolean; action?: ApprovalAction; error?: string }> {
  const db = getAdminDb();
  const doc = await db.collection(REQUESTS_COLLECTION).doc(requestId).get();

  if (!doc.exists) {
    return { success: false, error: '申請が見つかりません' };
  }

  const request = docToRequest(doc);

  const action = await recordAction(
    requestId,
    request.currentStepOrder,
    actorUserId,
    'comment',
    note,
    actorUserName
  );

  return { success: true, action };
}

/**
 * 申請のアクション履歴取得
 */
export async function listRequestActions(requestId: string): Promise<ApprovalAction[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(ACTIONS_COLLECTION)
    .where('requestId', '==', requestId)
    .orderBy('createdAt', 'asc')
    .get();

  return snapshot.docs.map(docToAction);
}

/**
 * 全アクション取得（監査ビュー用）
 * Ticket 064-final
 */
export async function listAllActions(limit: number = 1000): Promise<ApprovalAction[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(ACTIONS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(docToAction);
}

/**
 * 承認待ち件数取得
 */
export async function countPendingRequests(): Promise<number> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(REQUESTS_COLLECTION)
    .where('status', '==', 'pending')
    .count()
    .get();
  return snapshot.data().count;
}

/**
 * 最古の承認待ち取得（滞留検知用）
 */
export async function getOldestPendingRequest(): Promise<ApprovalRequest | null> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(REQUESTS_COLLECTION)
    .where('status', '==', 'pending')
    .orderBy('submittedAt', 'asc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return docToRequest(snapshot.docs[0]);
}
