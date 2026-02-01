/**
 * アクション項目ステータス変更API
 *
 * POST /api/committees/action-items/[id]/status - ステータス変更（manager+ or owner）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActionItem, setActionItemStatus } from '@/lib/committees/repo';
import { canUpdateActionItem } from '@/lib/committees/types';
import type { ActionItemStatus } from '@/lib/committees/types';

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
    const { id } = await params;
    const actionItem = getActionItem(id);

    if (!actionItem) {
      return NextResponse.json(
        { success: false, error: 'アクション項目が見つかりません' },
        { status: 404 }
      );
    }

    if (!canUpdateActionItem(DEMO_USER, actionItem)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status } = body as { status: ActionItemStatus };

    if (!status || !['open', 'in_progress', 'done', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: '有効なステータスを指定してください' },
        { status: 400 }
      );
    }

    const result = setActionItemStatus(id, status, DEMO_USER.userId);

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
    console.error('アクション項目ステータス変更エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ステータスの変更に失敗しました' },
      { status: 500 }
    );
  }
}
