/**
 * 承認申請リポジトリ
 *
 * インメモリストレージ（本番ではDBに置き換え）
 * 申請インスタンスとアクション（監査ログ）の管理
 */

import type {
  ApprovalRequest,
  ApprovalAction,
  CreateApprovalRequestRequest,
  ApprovalRequestFilter,
  ApprovalRequestListItem,
  RequestStatus,
  ActionType,
} from './types';
import { getApprovalFlow } from './flowRepo';
import { selectFlowForRequest } from './selectFlow';
import { guardDemoSeed } from '@/config/runtimeFlags';

// インメモリストレージ
const requestsStore = new Map<string, ApprovalRequest>();
const actionsStore = new Map<string, ApprovalAction>();

// 初期化フラグ
let isInitialized = false;

// ID生成用カウンター
let requestIdCounter = 1;
let actionIdCounter = 1;

function generateRequestId(): string {
  return `req_${String(requestIdCounter++).padStart(5, '0')}`;
}

function generateActionId(): string {
  return `act_${String(actionIdCounter++).padStart(6, '0')}`;
}

/**
 * デモデータで初期化（本番では空ストアのまま）
 */
function initializeStore(): void {
  if (isInitialized) return;
  isInitialized = true;

  if (!guardDemoSeed('requestRepo.initializeStore')) return;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  // デモ申請1: 経費（承認待ち）
  const req1: ApprovalRequest = {
    id: generateRequestId(),
    requestType: 'expense',
    entityId: 'exp_001',
    requesterUserId: 'user_003',
    requesterUserName: '鈴木花子',
    flowId: 'flow_001',
    flowName: '経費申請フロー（5万円以下）',
    status: 'pending',
    currentStepOrder: 1,
    title: '経費申請: 交通費 12,340円',
    summary: '営業訪問のための交通費',
    metaJson: { amount: 12340, hasAttachment: true },
    submittedAt: yesterday.toISOString(),
    decidedAt: null,
    dueAt: null,
    createdAt: twoDaysAgo.toISOString(),
    updatedAt: yesterday.toISOString(),
  };
  requestsStore.set(req1.id, req1);

  // アクション: 提出
  const act1: ApprovalAction = {
    id: generateActionId(),
    requestId: req1.id,
    stepOrder: 0,
    actorUserId: 'user_003',
    actorUserName: '鈴木花子',
    action: 'submit',
    note: null,
    createdAt: yesterday.toISOString(),
  };
  actionsStore.set(act1.id, act1);

  // デモ申請2: 残業（承認済み）
  const req2: ApprovalRequest = {
    id: generateRequestId(),
    requestType: 'overtime',
    entityId: 'ot_001',
    requesterUserId: 'user_002',
    requesterUserName: '田中太郎',
    flowId: 'flow_003',
    flowName: '残業申請フロー',
    status: 'approved',
    currentStepOrder: 1,
    title: '残業申請: 2月1日 2時間',
    summary: '月次レポート作成のため',
    metaJson: { targetMonth: '2026-02', hasAttachment: false },
    submittedAt: twoDaysAgo.toISOString(),
    decidedAt: yesterday.toISOString(),
    dueAt: null,
    createdAt: twoDaysAgo.toISOString(),
    updatedAt: yesterday.toISOString(),
  };
  requestsStore.set(req2.id, req2);

  // アクション: 提出 → 承認
  const act2: ApprovalAction = {
    id: generateActionId(),
    requestId: req2.id,
    stepOrder: 0,
    actorUserId: 'user_002',
    actorUserName: '田中太郎',
    action: 'submit',
    note: null,
    createdAt: twoDaysAgo.toISOString(),
  };
  const act3: ApprovalAction = {
    id: generateActionId(),
    requestId: req2.id,
    stepOrder: 1,
    actorUserId: 'user_006',
    actorUserName: '山田マネージャー',
    action: 'approve',
    note: '承認します',
    createdAt: yesterday.toISOString(),
  };
  actionsStore.set(act2.id, act2);
  actionsStore.set(act3.id, act3);

  // デモ申請3: 汎用（下書き）
  const req3: ApprovalRequest = {
    id: generateRequestId(),
    requestType: 'generic',
    entityId: null,
    requesterUserId: 'user_001',
    requesterUserName: '佐藤太郎',
    flowId: 'flow_004',
    flowName: '汎用承認フロー',
    status: 'draft',
    currentStepOrder: 0,
    title: '新規備品購入申請',
    summary: 'プロジェクター購入の申請',
    metaJson: { amount: 85000 },
    submittedAt: null,
    decidedAt: null,
    dueAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  requestsStore.set(req3.id, req3);

  isInitialized = true;
}

// ========================================
// 申請操作
// ========================================

/**
 * 申請一覧取得
 */
export function listApprovalRequests(filter: ApprovalRequestFilter = {}): {
  requests: ApprovalRequestListItem[];
  total: number;
} {
  initializeStore();

  let requests = Array.from(requestsStore.values());

  // フィルタ
  if (filter.requestType) {
    requests = requests.filter((r) => r.requestType === filter.requestType);
  }
  if (filter.status) {
    requests = requests.filter((r) => r.status === filter.status);
  }
  if (filter.requesterUserId) {
    requests = requests.filter((r) => r.requesterUserId === filter.requesterUserId);
  }

  const total = requests.length;

  // ソート（更新日時降順）
  requests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  requests = requests.slice(offset, offset + limit);

  // 現ステップ情報を付加
  const items: ApprovalRequestListItem[] = requests.map((r) => {
    const flow = getApprovalFlow(r.flowId);
    const currentStep = flow?.steps.find((s) => s.stepOrder === r.currentStepOrder);
    return {
      ...r,
      currentStepInfo: currentStep
        ? {
            approverType: currentStep.approverType,
            approverRole: currentStep.approverRole,
            approverUserId: currentStep.approverUserId,
          }
        : undefined,
    };
  });

  return { requests: items, total };
}

/**
 * 申請取得
 */
export function getApprovalRequest(requestId: string): ApprovalRequest | null {
  initializeStore();
  return requestsStore.get(requestId) ?? null;
}

/**
 * 申請作成（draft）
 */
export function createApprovalRequest(
  data: CreateApprovalRequestRequest,
  requesterUserId: string,
  requesterUserName?: string
): { success: boolean; request?: ApprovalRequest; error?: string } {
  initializeStore();

  // フロー選択
  const flowResult = selectFlowForRequest(data.requestType, data.meta);
  if (!flowResult.flow) {
    return {
      success: false,
      error: flowResult.reason ?? '適用可能なフローが見つかりません',
    };
  }

  const now = new Date().toISOString();
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
    createdAt: now,
    updatedAt: now,
  };

  requestsStore.set(requestId, request);

  return { success: true, request };
}

/**
 * 申請提出（draft → pending）
 */
export function submitApprovalRequest(
  requestId: string,
  actorUserId: string,
  actorUserName?: string
): { success: boolean; request?: ApprovalRequest; error?: string } {
  initializeStore();

  const request = requestsStore.get(requestId);
  if (!request) {
    return { success: false, error: '申請が見つかりません' };
  }

  if (request.status !== 'draft') {
    return { success: false, error: 'draft状態の申請のみ提出可能です' };
  }

  if (request.requesterUserId !== actorUserId) {
    return { success: false, error: '申請者本人のみ提出可能です' };
  }

  const now = new Date().toISOString();
  const updated: ApprovalRequest = {
    ...request,
    status: 'pending',
    currentStepOrder: 1,
    submittedAt: now,
    updatedAt: now,
  };

  requestsStore.set(requestId, updated);

  // アクション記録
  recordAction(requestId, 0, actorUserId, 'submit', null, actorUserName);

  return { success: true, request: updated };
}

/**
 * 承認
 */
export function approveRequest(
  requestId: string,
  actorUserId: string,
  note?: string,
  actorUserName?: string
): { success: boolean; request?: ApprovalRequest; error?: string } {
  initializeStore();

  const request = requestsStore.get(requestId);
  if (!request) {
    return { success: false, error: '申請が見つかりません' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'pending状態の申請のみ承認可能です' };
  }

  const flow = getApprovalFlow(request.flowId);
  if (!flow) {
    return { success: false, error: 'フローが見つかりません' };
  }

  const now = new Date().toISOString();
  const currentStepOrder = request.currentStepOrder;
  const nextStepOrder = currentStepOrder + 1;
  const hasNextStep = flow.steps.some((s) => s.stepOrder === nextStepOrder);

  // アクション記録
  recordAction(requestId, currentStepOrder, actorUserId, 'approve', note ?? null, actorUserName);

  if (hasNextStep) {
    // 次ステップへ
    const updated: ApprovalRequest = {
      ...request,
      currentStepOrder: nextStepOrder,
      updatedAt: now,
    };
    requestsStore.set(requestId, updated);
    return { success: true, request: updated };
  } else {
    // 最終承認
    const updated: ApprovalRequest = {
      ...request,
      status: 'approved',
      decidedAt: now,
      updatedAt: now,
    };
    requestsStore.set(requestId, updated);
    return { success: true, request: updated };
  }
}

/**
 * 却下
 */
export function rejectRequest(
  requestId: string,
  actorUserId: string,
  note?: string,
  actorUserName?: string
): { success: boolean; request?: ApprovalRequest; error?: string } {
  initializeStore();

  const request = requestsStore.get(requestId);
  if (!request) {
    return { success: false, error: '申請が見つかりません' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'pending状態の申請のみ却下可能です' };
  }

  const now = new Date().toISOString();
  const updated: ApprovalRequest = {
    ...request,
    status: 'rejected',
    decidedAt: now,
    updatedAt: now,
  };

  requestsStore.set(requestId, updated);

  // アクション記録
  recordAction(requestId, request.currentStepOrder, actorUserId, 'reject', note ?? null, actorUserName);

  return { success: true, request: updated };
}

/**
 * 差戻し
 */
export function returnRequest(
  requestId: string,
  actorUserId: string,
  note?: string,
  actorUserName?: string
): { success: boolean; request?: ApprovalRequest; error?: string } {
  initializeStore();

  const request = requestsStore.get(requestId);
  if (!request) {
    return { success: false, error: '申請が見つかりません' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'pending状態の申請のみ差戻し可能です' };
  }

  const now = new Date().toISOString();
  const updated: ApprovalRequest = {
    ...request,
    status: 'returned',
    updatedAt: now,
  };

  requestsStore.set(requestId, updated);

  // アクション記録
  recordAction(requestId, request.currentStepOrder, actorUserId, 'return', note ?? null, actorUserName);

  return { success: true, request: updated };
}

/**
 * 取消（申請者のみ、draft/pending のみ）
 */
export function cancelRequest(
  requestId: string,
  actorUserId: string,
  actorUserName?: string
): { success: boolean; request?: ApprovalRequest; error?: string } {
  initializeStore();

  const request = requestsStore.get(requestId);
  if (!request) {
    return { success: false, error: '申請が見つかりません' };
  }

  if (request.requesterUserId !== actorUserId) {
    return { success: false, error: '申請者本人のみ取消可能です' };
  }

  if (request.status !== 'draft' && request.status !== 'pending') {
    return { success: false, error: 'draft/pending状態の申請のみ取消可能です' };
  }

  const now = new Date().toISOString();
  const updated: ApprovalRequest = {
    ...request,
    status: 'cancelled',
    updatedAt: now,
  };

  requestsStore.set(requestId, updated);

  // アクション記録
  recordAction(requestId, request.currentStepOrder, actorUserId, 'cancel', null, actorUserName);

  return { success: true, request: updated };
}

// ========================================
// アクション（監査ログ）操作
// ========================================

/**
 * アクション記録
 */
function recordAction(
  requestId: string,
  stepOrder: number,
  actorUserId: string,
  action: ActionType,
  note: string | null,
  actorUserName?: string
): ApprovalAction {
  const actionId = generateActionId();
  const now = new Date().toISOString();

  const actionRecord: ApprovalAction = {
    id: actionId,
    requestId,
    stepOrder,
    actorUserId,
    actorUserName,
    action,
    note,
    createdAt: now,
  };

  actionsStore.set(actionId, actionRecord);

  return actionRecord;
}

/**
 * コメント追加
 */
export function addComment(
  requestId: string,
  actorUserId: string,
  note: string,
  actorUserName?: string
): { success: boolean; action?: ApprovalAction; error?: string } {
  initializeStore();

  const request = requestsStore.get(requestId);
  if (!request) {
    return { success: false, error: '申請が見つかりません' };
  }

  const action = recordAction(
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
export function listRequestActions(requestId: string): ApprovalAction[] {
  initializeStore();

  const actions: ApprovalAction[] = [];
  for (const action of actionsStore.values()) {
    if (action.requestId === requestId) {
      actions.push(action);
    }
  }

  // 日時昇順
  actions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return actions;
}

/**
 * 全アクション取得（監査ビュー用）
 * Ticket 064-final
 */
export function listAllActions(limit: number = 1000): ApprovalAction[] {
  initializeStore();

  const actions = Array.from(actionsStore.values());

  // 日時降順（新しい順）
  actions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return actions.slice(0, limit);
}

/**
 * 承認待ち件数取得
 */
export function countPendingRequests(): number {
  initializeStore();

  let count = 0;
  for (const request of requestsStore.values()) {
    if (request.status === 'pending') {
      count++;
    }
  }
  return count;
}

/**
 * 最古の承認待ち取得（滞留検知用）
 */
export function getOldestPendingRequest(): ApprovalRequest | null {
  initializeStore();

  let oldest: ApprovalRequest | null = null;

  for (const request of requestsStore.values()) {
    if (request.status === 'pending' && request.submittedAt) {
      if (!oldest || (oldest.submittedAt && request.submittedAt < oldest.submittedAt)) {
        oldest = request;
      }
    }
  }

  return oldest;
}

/**
 * ストアクリア（テスト用）
 */
export function clearApprovalRequestsStore(): void {
  requestsStore.clear();
  actionsStore.clear();
  isInitialized = false;
  requestIdCounter = 1;
  actionIdCounter = 1;
}
