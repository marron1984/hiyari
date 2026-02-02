/**
 * 承認フローAPI
 *
 * GET /api/approval-flows - フロー一覧取得
 * POST /api/approval-flows - フロー作成（adminのみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listApprovalFlows,
  createApprovalFlow,
} from '@/lib/approvals/flowRepo';
import { checkRole } from '@/lib/auth/requireRole';
import type { FlowStatus, RequestType } from '@/lib/approvals/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestType = searchParams.get('requestType') as RequestType | null;
  const status = searchParams.get('status') as FlowStatus | null;
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const { flows, total } = listApprovalFlows({
    requestType: requestType ?? undefined,
    status: status ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({
    flows,
    total,
  });
}

export async function POST(request: NextRequest) {
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

  // バリデーション
  if (!body.name || !body.requestType) {
    return NextResponse.json(
      { error: '必須項目が不足しています（name, requestType）' },
      { status: 400 }
    );
  }

  const result = createApprovalFlow({
    name: body.name,
    requestType: body.requestType,
    description: body.description,
    conditionJson: body.conditionJson,
    steps: body.steps,
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
