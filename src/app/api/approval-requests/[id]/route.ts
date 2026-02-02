/**
 * 承認申請詳細API
 *
 * GET /api/approval-requests/[id] - 申請詳細取得（関係者のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getApprovalRequest,
  listRequestActions,
} from '@/lib/approvals/requestRepo';
import { getApprovalFlow } from '@/lib/approvals/flowRepo';
import { canViewRequest } from '@/lib/approvals/canApprove';
import type { AppRole } from '@/config/appRoles';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ユーザー情報取得（本番では認証から）
  const userId = request.headers.get('x-user-id') ?? 'user_001';
  const userRole = (request.headers.get('x-user-role') ?? 'staff') as AppRole;

  const approvalRequest = getApprovalRequest(id);
  if (!approvalRequest) {
    return NextResponse.json(
      { error: '申請が見つかりません' },
      { status: 404 }
    );
  }

  // アクション履歴取得
  const actions = listRequestActions(id);

  // 閲覧権限チェック
  if (!canViewRequest(userRole, userId, approvalRequest, actions)) {
    return NextResponse.json(
      { error: 'この申請を閲覧する権限がありません' },
      { status: 403 }
    );
  }

  // フロー情報取得
  const flow = getApprovalFlow(approvalRequest.flowId);

  return NextResponse.json({
    request: approvalRequest,
    actions,
    flow,
  });
}
