/**
 * アクション項目作成API
 *
 * POST /api/committees/meetings/[id]/action-items - アクション項目作成（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createActionItem } from '@/lib/committees/repo';
import { canManageCommittees } from '@/lib/committees/types';

// デモ用ユーザー
const DEMO_USER = {
  userId: 'user_manager',
  role: 'manager' as const,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!canManageCommittees(DEMO_USER)) {
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
      DEMO_USER.userId
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
