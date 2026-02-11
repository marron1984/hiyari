/**
 * 承認申請API
 *
 * POST /api/approval-requests - 申請作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApprovalRequest } from '@/lib/approvals/requestRepo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

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
  if (!body.requestType || !body.title) {
    return NextResponse.json(
      { error: '必須項目が不足しています（requestType, title）' },
      { status: 400 }
    );
  }

  const result = createApprovalRequest(
    {
      requestType: body.requestType,
      entityId: body.entityId,
      title: body.title,
      summary: body.summary,
      meta: body.meta,
    },
    user.uid,
    user.name
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    request: result.request,
  });
}
