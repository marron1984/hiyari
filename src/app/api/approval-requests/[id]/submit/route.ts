/**
 * 申請提出API
 *
 * POST /api/approval-requests/[id]/submit - 申請を提出（draft → pending）
 */

import { NextRequest, NextResponse } from 'next/server';
import { submitApprovalRequest, getApprovalRequest } from '@/lib/approvals/requestRepo';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ユーザー情報取得（本番では認証から）
  const userId = request.headers.get('x-user-id') ?? 'user_001';
  const userName = request.headers.get('x-user-name') ?? '佐藤太郎';

  const existing = getApprovalRequest(id);
  if (!existing) {
    return NextResponse.json(
      { error: '申請が見つかりません' },
      { status: 404 }
    );
  }

  const result = submitApprovalRequest(id, userId, userName);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  // TODO: 通知センター連携（承認者への通知）

  return NextResponse.json({
    success: true,
    request: result.request,
  });
}
