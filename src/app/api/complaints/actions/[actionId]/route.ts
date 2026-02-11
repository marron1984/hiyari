/**
 * クレームアクション更新API
 *
 * PATCH /api/complaints/actions/[actionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateAction } from '@/lib/complaints/repo';
import { canManageComplaints } from '@/lib/complaints/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canManageComplaints({ userId: user.uid, role: user.role as AppRole })) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { actionId } = await params;
    const body = await request.json();

    const result = updateAction(actionId, body, user.uid);

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
