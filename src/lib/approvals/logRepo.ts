/**
 * 承認ログリポジトリ（横断検索・監査ビュー）
 *
 * 重要: approval_actions は append-only（編集・削除禁止）
 */

import type { AppRole } from '@/config/appRoles';
import type {
  ApprovalAction,
  ApprovalRequest,
  RequestType,
  RequestStatus,
  ActionType,
} from './types';
import {
  listApprovalRequests,
  listRequestActions,
  getApprovalRequest,
} from './requestRepo';
import { canViewRequest } from './canApprove';

/**
 * ログ検索フィルタ
 */
export interface ApprovalLogFilter {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  requestType?: RequestType;
  action?: ActionType;
  actorUserId?: string;
  requesterUserId?: string;
  status?: RequestStatus;
  flowId?: string;
  requestId?: string;
  q?: string; // title検索
  limit?: number;
  offset?: number;
}

/**
 * ログアイテム（APIレスポンス用）
 */
export interface ApprovalLogItem {
  actionId: string;
  createdAt: string;
  action: ActionType;
  note: string | null;
  actor: {
    id: string;
    name: string;
  };
  request: {
    id: string;
    requestType: RequestType;
    title: string;
    status: RequestStatus;
    requester: {
      id: string;
      name: string;
    };
    submittedAt: string | null;
    decidedAt: string | null;
    currentStepOrder: number;
  };
}

/**
 * ログ一覧結果
 */
export interface ApprovalLogResult {
  items: ApprovalLogItem[];
  totalCount: number;
}

/**
 * ログ統計
 */
export interface ApprovalLogStats {
  totalActions: number;
  submits: number;
  approvals: number;
  rejects: number;
  returns: number;
  cancels: number;
  comments: number;
  avgLeadTimeHours: number | null;
  topActors: { userId: string; userName: string; count: number }[];
}

/**
 * ユーザーがアクセス可能なrequestId集合を取得
 * staff/leader の場合は関係者のみに絞る
 */
function getAccessibleRequestIds(
  userRole: AppRole,
  userId: string
): Set<string> | null {
  // admin, auditor, executive, manager は全件アクセス可
  if (['admin', 'auditor', 'executive', 'manager'].includes(userRole)) {
    return null; // null = 制限なし
  }

  // leader, staff は関係者のみ
  const accessibleIds = new Set<string>();
  const { requests } = listApprovalRequests({});

  for (const request of requests) {
    const actions = listRequestActions(request.id);
    if (canViewRequest(userRole, userId, request, actions)) {
      accessibleIds.add(request.id);
    }
  }

  return accessibleIds;
}

/**
 * 承認ログ一覧取得（横断検索）
 */
export function listApprovalLogs(
  filter: ApprovalLogFilter,
  userRole: AppRole,
  userId: string
): ApprovalLogResult {
  // アクセス可能なrequestId集合を取得
  const accessibleRequestIds = getAccessibleRequestIds(userRole, userId);

  // 全申請を取得
  const { requests } = listApprovalRequests({});

  // requestIdをキーにしたマップを作成
  const requestMap = new Map<string, ApprovalRequest>();
  for (const req of requests) {
    // アクセス制限チェック
    if (accessibleRequestIds !== null && !accessibleRequestIds.has(req.id)) {
      continue;
    }
    requestMap.set(req.id, req);
  }

  // 全アクションを収集
  const allItems: ApprovalLogItem[] = [];

  for (const [requestId, request] of requestMap) {
    // フィルタ: requestType
    if (filter.requestType && request.requestType !== filter.requestType) {
      continue;
    }

    // フィルタ: status
    if (filter.status && request.status !== filter.status) {
      continue;
    }

    // フィルタ: flowId
    if (filter.flowId && request.flowId !== filter.flowId) {
      continue;
    }

    // フィルタ: requesterUserId
    if (filter.requesterUserId && request.requesterUserId !== filter.requesterUserId) {
      continue;
    }

    // フィルタ: requestId（特定申請のログ）
    if (filter.requestId && request.id !== filter.requestId) {
      continue;
    }

    // フィルタ: q（title検索）
    if (filter.q && !request.title.toLowerCase().includes(filter.q.toLowerCase())) {
      continue;
    }

    // このrequestのアクションを取得
    const actions = listRequestActions(requestId);

    for (const act of actions) {
      // フィルタ: action
      if (filter.action && act.action !== filter.action) {
        continue;
      }

      // フィルタ: actorUserId
      if (filter.actorUserId && act.actorUserId !== filter.actorUserId) {
        continue;
      }

      // フィルタ: dateFrom
      if (filter.dateFrom) {
        const actDate = act.createdAt.slice(0, 10);
        if (actDate < filter.dateFrom) {
          continue;
        }
      }

      // フィルタ: dateTo
      if (filter.dateTo) {
        const actDate = act.createdAt.slice(0, 10);
        if (actDate > filter.dateTo) {
          continue;
        }
      }

      allItems.push({
        actionId: act.id,
        createdAt: act.createdAt,
        action: act.action,
        note: act.note,
        actor: {
          id: act.actorUserId,
          name: act.actorUserName ?? act.actorUserId,
        },
        request: {
          id: request.id,
          requestType: request.requestType,
          title: request.title,
          status: request.status,
          requester: {
            id: request.requesterUserId,
            name: request.requesterUserName ?? request.requesterUserId,
          },
          submittedAt: request.submittedAt,
          decidedAt: request.decidedAt,
          currentStepOrder: request.currentStepOrder,
        },
      });
    }
  }

  // createdAt DESC でソート
  allItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const totalCount = allItems.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  const items = allItems.slice(offset, offset + limit);

  return { items, totalCount };
}

/**
 * 承認ログ統計取得
 */
export function getApprovalLogStats(
  filter: Omit<ApprovalLogFilter, 'limit' | 'offset'>,
  userRole: AppRole,
  userId: string
): ApprovalLogStats {
  // 全ログを取得（ページネーションなし）
  const { items } = listApprovalLogs(
    { ...filter, limit: 100000, offset: 0 },
    userRole,
    userId
  );

  // カウント
  let submits = 0;
  let approvals = 0;
  let rejects = 0;
  let returns = 0;
  let cancels = 0;
  let comments = 0;

  const actorCounts = new Map<string, { userName: string; count: number }>();

  for (const item of items) {
    switch (item.action) {
      case 'submit':
        submits++;
        break;
      case 'approve':
        approvals++;
        break;
      case 'reject':
        rejects++;
        break;
      case 'return':
        returns++;
        break;
      case 'cancel':
        cancels++;
        break;
      case 'comment':
        comments++;
        break;
    }

    // actor集計
    const existing = actorCounts.get(item.actor.id);
    if (existing) {
      existing.count++;
    } else {
      actorCounts.set(item.actor.id, { userName: item.actor.name, count: 1 });
    }
  }

  // 平均リードタイム計算（submit→approve/rejectまでの時間）
  let totalLeadTimeMs = 0;
  let leadTimeCount = 0;

  // requestIdごとに計算
  const requestSubmitTimes = new Map<string, string>();
  const requestDecideTimes = new Map<string, string>();

  for (const item of items) {
    if (item.action === 'submit') {
      requestSubmitTimes.set(item.request.id, item.createdAt);
    }
    if (item.action === 'approve' || item.action === 'reject') {
      if (!requestDecideTimes.has(item.request.id)) {
        requestDecideTimes.set(item.request.id, item.createdAt);
      }
    }
  }

  for (const [requestId, submitTime] of requestSubmitTimes) {
    const decideTime = requestDecideTimes.get(requestId);
    if (decideTime) {
      const diff = new Date(decideTime).getTime() - new Date(submitTime).getTime();
      if (diff > 0) {
        totalLeadTimeMs += diff;
        leadTimeCount++;
      }
    }
  }

  const avgLeadTimeHours = leadTimeCount > 0
    ? Math.round((totalLeadTimeMs / leadTimeCount / 1000 / 60 / 60) * 10) / 10
    : null;

  // Top actors
  const topActors = Array.from(actorCounts.entries())
    .map(([userId, data]) => ({ userId, userName: data.userName, count: data.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalActions: items.length,
    submits,
    approvals,
    rejects,
    returns,
    cancels,
    comments,
    avgLeadTimeHours,
    topActors,
  };
}

/**
 * CSVエクスポート用データ取得
 * admin/auditor のみ使用可
 */
export function exportApprovalLogsForCsv(
  filter: Omit<ApprovalLogFilter, 'limit' | 'offset'>,
  userRole: AppRole,
  userId: string
): { allowed: boolean; data?: ApprovalLogItem[]; error?: string } {
  // admin/auditor のみエクスポート可
  if (!['admin', 'auditor'].includes(userRole)) {
    return { allowed: false, error: 'エクスポート権限がありません' };
  }

  const { items } = listApprovalLogs(
    { ...filter, limit: 100000, offset: 0 },
    userRole,
    userId
  );

  return { allowed: true, data: items };
}
