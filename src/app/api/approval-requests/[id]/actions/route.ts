/**
 * 申請アクション履歴API
 *
 * GET /api/approval-requests/[id]/actions - アクション履歴取得（関係者のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getApprovalRequest,
  listRequestActions,
} from '@/lib/approvals/requestRepo';
import { canViewRequest } from '@/lib/approvals/canApprove';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

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
  if (!canViewRequest(user.role as AppRole, user.uid, approvalRequest, actions)) {
    return NextResponse.json(
      { error: 'この申請を閲覧する権限がありません' },
      { status: 403 }
    );
  }

  return NextResponse.json({
    actions,
  });
}
