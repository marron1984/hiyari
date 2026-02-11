/**
 * 承認API
 *
 * POST /api/approval-requests/[id]/approve - 申請を承認
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  approveRequest,
  getApprovalRequest,
} from '@/lib/approvals/requestRepo';
import { getApprovalFlow } from '@/lib/approvals/flowRepo';
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

  // 承認権限チェック
  const approveCheck = canApprove(userRole, userId, existing);
  if (!approveCheck.canApprove) {
    return NextResponse.json(
      { error: approveCheck.reason ?? '承認権限がありません' },
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

  const result = approveRequest(id, userId, note, userName);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  // 申請者・次ステップ承認者への通知
  try {
    const today = new Date().toISOString().split('T')[0];
    if (result.request!.status === 'approved') {
      // 最終承認 → 申請者へ通知
      await createNotificationAsync({
        tenantId: 'default',
        userId: result.request!.requesterUserId,
        type: 'application_approved',
        severity: 'info',
        title: '申請が承認されました',
        message: `「${result.request!.title}」が承認されました。`,
        url: `/dashboard/approvals/${id}`,
        fingerprint: `application_approved:${id}:${today}:${result.request!.requesterUserId}`,
      });
    } else {
      // 次ステップへ → 次の承認者へ通知
      const flow = getApprovalFlow(result.request!.flowId);
      const nextStep = flow?.steps.find(
        (s) => s.stepOrder === result.request!.currentStepOrder
      );
      const approverId = nextStep?.approverUserId ?? nextStep?.approverRole;
      if (approverId) {
        await createNotificationAsync({
          tenantId: 'default',
          userId: approverId,
          type: 'approval_pending',
          severity: 'warning',
          title: '承認依頼',
          message: `「${result.request!.title}」の承認依頼が届きました。`,
          url: `/dashboard/approvals/${id}`,
          fingerprint: `approval_pending:${id}:${today}:${approverId}`,
        });
      }
    }
  } catch (e) {
    console.error('[Notification] Failed to send approval notification:', e);
  }

  return NextResponse.json({
    success: true,
    request: result.request,
  });
}
