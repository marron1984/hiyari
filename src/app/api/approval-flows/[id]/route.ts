/**
 * 承認フロー詳細API
 *
 * GET /api/approval-flows/[id] - フロー詳細取得
 * PATCH /api/approval-flows/[id] - フロー更新（adminのみ、draftのみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getApprovalFlow,
  updateApprovalFlow,
} from '@/lib/approvals/flowRepo.firestore';
import { checkRole } from '@/lib/auth/requireRole';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const flow = await getApprovalFlow(id);
  if (!flow) {
    return NextResponse.json(
      { error: 'フローが見つかりません' },
      { status: 404 }
    );
  }

  return NextResponse.json({ flow });
}

export async function PATCH(
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが不正です' },
      { status: 400 }
    );
  }

  const result = await updateApprovalFlow(id, {
    name: body.name,
    description: body.description,
    conditionJson: body.conditionJson,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    flow: result.flow,
  });
}
