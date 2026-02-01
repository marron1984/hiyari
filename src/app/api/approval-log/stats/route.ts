/**
 * 承認ログ統計API
 *
 * GET /api/approval-log/stats
 * - 件数、approve/reject比率、平均リードタイム、トップアクター
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApprovalLogStats, type ApprovalLogFilter } from '@/lib/approvals/logRepo';
import type { AppRole } from '@/config/appRoles';
import type { RequestType, RequestStatus, ActionType } from '@/lib/approvals/types';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_006',
  name: '山田マネージャー',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // クエリパラメータからフィルタを構築
    const filter: Omit<ApprovalLogFilter, 'limit' | 'offset'> = {};

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

    // 統計取得（RBAC適用）
    const stats = getApprovalLogStats(filter, DEMO_USER.role, DEMO_USER.id);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('approval-log stats GET error:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
