/**
 * アクション項目ステータス変更API
 *
 * POST /api/committees/action-items/[id]/status - ステータス変更（manager+ or owner）
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getActionItem, setActionItemStatus } from '@/lib/committees/repo';
import { canUpdateActionItem } from '@/lib/committees/types';
import type { ActionItemStatus } from '@/lib/committees/types';

export async function POST(
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
    const { status } = body as { status: ActionItemStatus };

    if (!status || !['open', 'in_progress', 'done', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: '有効なステータスを指定してください' },
        { status: 400 }
      );
    }

    const result = setActionItemStatus(id, status, currentUser.id);

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
