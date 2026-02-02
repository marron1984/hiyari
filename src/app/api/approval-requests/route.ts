/**
 * 承認申請API
 *
 * POST /api/approval-requests - 申請作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApprovalRequest } from '@/lib/approvals/requestRepo';

export async function POST(request: NextRequest) {
  // ユーザーID取得（本番では認証から）
  const userId = request.headers.get('x-user-id') ?? 'user_001';
  const userName = request.headers.get('x-user-name') ?? '佐藤太郎';

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
    userId,
    userName
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
