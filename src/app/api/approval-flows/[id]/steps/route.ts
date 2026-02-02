/**
 * 承認フローステップAPI
 *
 * POST /api/approval-flows/[id]/steps - ステップ追加（adminのみ、draftのみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { addFlowStep, getApprovalFlow } from '@/lib/approvals/flowRepo';
import { checkRole } from '@/lib/auth/requireRole';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  // バリデーション
  if (body.stepOrder === undefined || !body.approverType) {
    return NextResponse.json(
      { error: '必須項目が不足しています（stepOrder, approverType）' },
      { status: 400 }
    );
  }

  const result = addFlowStep(id, {
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
