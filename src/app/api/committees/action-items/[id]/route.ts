/**
 * アクション項目詳細・更新API
 *
 * GET   /api/committees/action-items/[id] - アクション項目詳細取得
 * PATCH /api/committees/action-items/[id] - アクション項目更新（manager+ or owner）
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getActionItem, updateActionItem } from '@/lib/committees/repo';
import { canUpdateActionItem } from '@/lib/committees/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

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
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const actionItem = getActionItem(id);

    if (!actionItem) {
      return NextResponse.json(
        { success: false, error: 'アクション項目が見つかりません' },
        { status: 404 }
      );
    }

    if (!canUpdateActionItem(currentUser, actionItem)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = updateActionItem(id, body, currentUser.id);

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
