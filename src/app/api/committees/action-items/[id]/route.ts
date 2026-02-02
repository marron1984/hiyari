/**
 * アクション項目詳細・更新API
 *
 * GET   /api/committees/action-items/[id] - アクション項目詳細取得
 * PATCH /api/committees/action-items/[id] - アクション項目更新（manager+ or owner）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActionItem, updateActionItem } from '@/lib/committees/repo';
import { canUpdateActionItem } from '@/lib/committees/types';

// デモ用ユーザー
const DEMO_USER = {
  userId: 'user_manager',
  role: 'manager' as const,
};

export async function GET(
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

    return NextResponse.json({
      success: true,
      actionItem,
    });
  } catch (error) {
    console.error('アクション項目詳細取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アクション項目の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const result = updateActionItem(id, body, DEMO_USER.userId);

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
    console.error('アクション項目更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アクション項目の更新に失敗しました' },
      { status: 500 }
    );
  }
}
