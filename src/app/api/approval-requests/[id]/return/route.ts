/**
 * 差戻しAPI
 *
 * POST /api/approval-requests/[id]/return - 申請を差戻し
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  returnRequest,
  getApprovalRequest,
} from '@/lib/approvals/requestRepo';
import { canApprove } from '@/lib/approvals/canApprove';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

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

  // 承認権限チェック（差戻しも同じ権限）
  const approveCheck = canApprove(user.role as AppRole, user.uid, existing);
  if (!approveCheck.canApprove) {
    return NextResponse.json(
      { error: approveCheck.reason ?? '差戻し権限がありません' },
      { status: 403 }
    );
  }

  // ノートを取得（差戻し理由は必須推奨）
  let note: string | undefined;
  try {
    const body = await request.json();
    note = body.note;
  } catch {
    // ノートなしでもOK
  }

  const result = returnRequest(id, user.uid, note, user.name);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  // 申請者への差戻し通知
  try {
    const today = new Date().toISOString().split('T')[0];
    await createNotificationAsync({
      tenantId: 'default',
      userId: result.request!.requesterUserId,
      type: 'application_returned',
      severity: 'warning',
      title: '申請が差戻しされました',
      message: `「${result.request!.title}」が差戻しされました。${note ? `理由: ${note}` : ''}`,
      url: `/dashboard/approvals/${id}`,
      fingerprint: `application_returned:${id}:${today}:${result.request!.requesterUserId}`,
    });
  } catch (e) {
    console.error('[Notification] Failed to send application_returned notification:', e);
  }

  return NextResponse.json({
    success: true,
    request: result.request,
  });
}
