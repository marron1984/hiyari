/**
 * 自分の申請一覧API
 *
 * GET /api/approval-requests/my - 自分の申請を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listApprovalRequests } from '@/lib/approvals/requestRepo';
import type { RequestStatus, RequestType } from '@/lib/approvals/types';

export async function GET(request: NextRequest) {
  // ユーザーID取得（本番では認証から）
  const userId = request.headers.get('x-user-id') ?? 'user_001';

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as RequestStatus | null;
  const requestType = searchParams.get('requestType') as RequestType | null;
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const { requests, total } = listApprovalRequests({
    requesterUserId: userId,
    status: status ?? undefined,
    requestType: requestType ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({
    requests,
    total,
  });
}
