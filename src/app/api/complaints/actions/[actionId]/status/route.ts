/**
 * クレームアクションステータス変更API
 *
 * POST /api/complaints/actions/[actionId]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { changeActionStatus } from '@/lib/complaints/repo';

const DEMO_USER = {
  userId: 'user_manager',
  role: 'manager' as const,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  try {
    const { actionId } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json(
        { success: false, error: 'ステータスを指定してください' },
        { status: 400 }
      );
    }

    const result = changeActionStatus(actionId, status, DEMO_USER.userId);

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
