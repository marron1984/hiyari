/**
 * アクション項目作成API
 *
 * POST /api/committees/meetings/[id]/action-items - アクション項目作成（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createActionItem } from '@/lib/committees/repo';
import { canManageCommittees } from '@/lib/committees/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canManageCommittees({ userId: user.uid, role: user.role as AppRole })) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { title, description, ownerUserId, ownerRole, dueAt } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'タイトルは必須です' },
        { status: 400 }
      );
    }

    const result = createActionItem(
      id,
      { title, description, ownerUserId, ownerRole, dueAt },
      user.uid
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      actionItem: result.actionItem,
    });
  } catch (error) {
    console.error('アクション項目作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アクション項目の作成に失敗しました' },
      { status: 500 }
    );
  }
}
