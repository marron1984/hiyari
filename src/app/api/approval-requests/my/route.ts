/**
 * 自分の申請一覧API
 *
 * GET /api/approval-requests/my - 自分の申請を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listApprovalRequests } from '@/lib/approvals/requestRepo.firestore';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { RequestStatus, RequestType } from '@/lib/approvals/types';

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as RequestStatus | null;
  const requestType = searchParams.get('requestType') as RequestType | null;
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const { requests, total } = await listApprovalRequests({
    requesterUserId: user.uid,
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
