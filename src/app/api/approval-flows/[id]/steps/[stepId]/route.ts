/**
 * 承認フローステップ詳細API
 *
 * PATCH /api/approval-flows/[id]/steps/[stepId] - ステップ更新（adminのみ、draftのみ）
 * DELETE /api/approval-flows/[id]/steps/[stepId] - ステップ削除（adminのみ、draftのみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  updateFlowStep,
  removeFlowStep,
  getApprovalFlow,
} from '@/lib/approvals/flowRepo';
import { checkRole } from '@/lib/auth/requireRole';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await params;

  // 管理者権限チェック
  const isAdmin = await checkRole(['admin']);
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'アクセス権限がありません（管理者のみ）' },
      { status: 403 }
    );
  }

  // フロー存在チェック
  const flow = getApprovalFlow(id);
  if (!flow) {
    return NextResponse.json(
      { error: 'フローが見つかりません' },
      { status: 404 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが不正です' },
      { status: 400 }
    );
  }

  const result = updateFlowStep(stepId, {
    stepOrder: body.stepOrder,
    approverType: body.approverType,
    approverRole: body.approverRole,
    approverUserId: body.approverUserId,
    required: body.required,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    step: result.step,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await params;

  // 管理者権限チェック
  const isAdmin = await checkRole(['admin']);
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'アクセス権限がありません（管理者のみ）' },
      { status: 403 }
    );
  }

  // フロー存在チェック
  const flow = getApprovalFlow(id);
  if (!flow) {
    return NextResponse.json(
      { error: 'フローが見つかりません' },
      { status: 404 }
    );
  }

  const result = removeFlowStep(stepId);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
  });
}
