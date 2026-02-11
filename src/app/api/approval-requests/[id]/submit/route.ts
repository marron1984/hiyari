/**
 * 申請提出API
 *
 * POST /api/approval-requests/[id]/submit - 申請を提出（draft → pending）
 */

import { NextRequest, NextResponse } from 'next/server';
import { submitApprovalRequest, getApprovalRequest } from '@/lib/approvals/requestRepo';
import { getApprovalFlow } from '@/lib/approvals/flowRepo';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';
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

  const result = submitApprovalRequest(id, user.uid, user.name);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  // 承認者への通知
  try {
    const today = new Date().toISOString().split('T')[0];
    const flow = getApprovalFlow(result.request!.flowId);
    const currentStep = flow?.steps.find(
      (s) => s.stepOrder === result.request!.currentStepOrder
    );
    const approverId = currentStep?.approverUserId ?? currentStep?.approverRole;
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
  } catch (e) {
    console.error('[Notification] Failed to send approval_pending notification:', e);
  }

  return NextResponse.json({
    success: true,
    request: result.request,
  });
}
