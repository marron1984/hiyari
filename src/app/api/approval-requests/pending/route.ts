/**
 * 承認待ち申請一覧API
 *
 * GET /api/approval-requests/pending - 自分が承認できる申請を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listApprovalRequests } from '@/lib/approvals/requestRepo';
import { filterApprovableRequests } from '@/lib/approvals/canApprove';
import type { AppRole } from '@/config/appRoles';
import type { RequestType } from '@/lib/approvals/types';

export async function GET(request: NextRequest) {
  // ユーザー情報取得（本番では認証から）
  const userId = request.headers.get('x-user-id') ?? 'user_001';
  const userRole = (request.headers.get('x-user-role') ?? 'staff') as AppRole;

  const { searchParams } = new URL(request.url);
  const requestType = searchParams.get('requestType') as RequestType | null;
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  // pending状態の申請を取得
  const { requests: allPending } = listApprovalRequests({
    status: 'pending',
    requestType: requestType ?? undefined,
    limit: 1000, // 一旦全件取得してフィルタ
    offset: 0,
  });

  // 承認可能なものだけフィルタ
  const approvable = filterApprovableRequests(userRole, userId, allPending);
  const total = approvable.length;

  // ページネーション
  const paginated = approvable.slice(offset, offset + limit);

  return NextResponse.json({
    requests: paginated,
    total,
  });
}
