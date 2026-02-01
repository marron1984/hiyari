/**
 * 承認フロー公開API
 *
 * POST /api/approval-flows/[id]/publish - フローを公開（adminのみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { publishApprovalFlow } from '@/lib/approvals/flowRepo';
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

  const result = publishApprovalFlow(id);

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
