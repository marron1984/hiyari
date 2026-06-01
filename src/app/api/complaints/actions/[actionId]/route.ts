/**
 * クレームアクション更新API
 *
 * PATCH /api/complaints/actions/[actionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { updateAction } from '@/lib/complaints/repo';
import { canManageComplaints } from '@/lib/complaints/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!canManageComplaints(currentUser)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { actionId } = await params;
    const body = await request.json();

    const result = updateAction(actionId, body, currentUser.id);

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
    console.error('アクション更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アクションの更新に失敗しました' },
      { status: 500 }
    );
  }
}
