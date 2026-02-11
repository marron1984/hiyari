/**
 * 却下API
 *
 * POST /api/approval-requests/[id]/reject - 申請を却下
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  rejectRequest,
  getApprovalRequest,
} from '@/lib/approvals/requestRepo';
import { canApprove } from '@/lib/approvals/canApprove';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';
import type { AppRole } from '@/config/appRoles';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ユーザー情報取得（本番では認証から）
  const userId = request.headers.get('x-user-id') ?? 'user_001';
  const userName = request.headers.get('x-user-name') ?? '佐藤太郎';
  const userRole = (request.headers.get('x-user-role') ?? 'staff') as AppRole;

  const existing = getApprovalRequest(id);
  if (!existing) {
    return NextResponse.json(
      { error: '申請が見つかりません' },
      { status: 404 }
    );
  }

  // 承認権限チェック（却下も同じ権限）
  const approveCheck = canApprove(userRole, userId, existing);
  if (!approveCheck.canApprove) {
    return NextResponse.json(
      { error: approveCheck.reason ?? '却下権限がありません' },
      { status: 403 }
    );
  }

  // ノートを取得
  let note: string | undefined;
  try {
    const body = await request.json();
    note = body.note;
  } catch {
    // ノートなしでもOK
  }

  const result = rejectRequest(id, userId, note, userName);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  // 申請者への却下通知
  try {
    const today = new Date().toISOString().split('T')[0];
    await createNotificationAsync({
      tenantId: 'default',
      userId: result.request!.requesterUserId,
      type: 'application_rejected',
      severity: 'warning',
      title: '申請が却下されました',
      message: `「${result.request!.title}」が却下されました。${note ? `理由: ${note}` : ''}`,
      url: `/dashboard/approvals/${id}`,
      fingerprint: `application_rejected:${id}:${today}:${result.request!.requesterUserId}`,
    });
  } catch (e) {
    console.error('[Notification] Failed to send application_rejected notification:', e);
  }

  return NextResponse.json({
    success: true,
    request: result.request,
  });
}
