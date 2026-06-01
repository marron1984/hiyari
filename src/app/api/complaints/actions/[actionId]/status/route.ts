/**
 * クレームアクションステータス変更API
 *
 * POST /api/complaints/actions/[actionId]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { changeActionStatus } from '@/lib/complaints/repo';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { actionId } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json(
        { success: false, error: 'ステータスを指定してください' },
        { status: 400 }
      );
    }

    const result = changeActionStatus(actionId, status, currentUser.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      action: result.action,
    });
  } catch (error) {
    console.error('アクションステータス変更エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ステータスの変更に失敗しました' },
      { status: 500 }
    );
  }
}
