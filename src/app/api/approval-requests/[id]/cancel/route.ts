/**
 * 取消API
 *
 * POST /api/approval-requests/[id]/cancel - 申請を取消（申請者本人のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  cancelRequest,
  getApprovalRequest,
} from '@/lib/approvals/requestRepo';
import { canCancel } from '@/lib/approvals/canApprove';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  const existing = getApprovalRequest(id);
  if (!existing) {
    return NextResponse.json(
      { error: '申請が見つかりません' },
      { status: 404 }
    );
  }

  // 取消権限チェック
  if (!canCancel(user.uid, existing)) {
    return NextResponse.json(
      { error: '取消権限がありません（申請者本人のみ、draft/pending状態のみ）' },
      { status: 403 }
    );
  }

  const result = cancelRequest(id, user.uid, user.name);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    request: result.request,
  });
}
