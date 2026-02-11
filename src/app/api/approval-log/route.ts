/**
 * 承認ログ一覧API
 *
 * GET /api/approval-log
 * - 横断検索（dateFrom, dateTo, requestType, action, status, q等）
 * - RBAC適用（staff/leaderは関係者のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { listApprovalLogs, type ApprovalLogFilter } from '@/lib/approvals/logRepo';
import type { AppRole } from '@/config/appRoles';
import type { RequestType, RequestStatus, ActionType } from '@/lib/approvals/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);

    // クエリパラメータからフィルタを構築
    const filter: ApprovalLogFilter = {};

    const dateFrom = searchParams.get('dateFrom');
    if (dateFrom) {
      filter.dateFrom = dateFrom;
    }

    const dateTo = searchParams.get('dateTo');
    if (dateTo) {
      filter.dateTo = dateTo;
    }

    const requestType = searchParams.get('requestType');
    if (requestType && ['expense', 'overtime', 'generic'].includes(requestType)) {
      filter.requestType = requestType as RequestType;
    }

    const action = searchParams.get('action');
    if (action && ['submit', 'approve', 'reject', 'return', 'cancel', 'comment'].includes(action)) {
      filter.action = action as ActionType;
    }

    const status = searchParams.get('status');
    if (status && ['draft', 'pending', 'approved', 'rejected', 'returned', 'cancelled'].includes(status)) {
      filter.status = status as RequestStatus;
    }

    const actorUserId = searchParams.get('actorUserId');
    if (actorUserId) {
      filter.actorUserId = actorUserId;
    }

    const requesterUserId = searchParams.get('requesterUserId');
    if (requesterUserId) {
      filter.requesterUserId = requesterUserId;
    }

    const flowId = searchParams.get('flowId');
    if (flowId) {
      filter.flowId = flowId;
    }

    const requestId = searchParams.get('requestId');
    if (requestId) {
      filter.requestId = requestId;
    }

    const q = searchParams.get('q');
    if (q) {
      filter.q = q;
    }

    const limitParam = searchParams.get('limit');
    filter.limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

    const offsetParam = searchParams.get('offset');
    filter.offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // ログ取得（RBAC適用）
    const result = listApprovalLogs(filter, user.role as AppRole, user.uid);

    return NextResponse.json({
      items: result.items,
      totalCount: result.totalCount,
      limit: filter.limit,
      offset: filter.offset,
    });
  } catch (error) {
    console.error('approval-log GET error:', error);
    return NextResponse.json(
      { error: '承認ログの取得に失敗しました' },
      { status: 500 }
    );
  }
}
