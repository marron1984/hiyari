/**
 * クレーム是正アクションAPI
 *
 * GET  /api/complaints/[id]/actions - アクション一覧
 * POST /api/complaints/[id]/actions - アクション追加（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getComplaintById, listActions, createAction } from '@/lib/complaints/repo';
import { canManageComplaints } from '@/lib/complaints/types';

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
    const complaint = getComplaintById(id, DEMO_USER);

    if (!complaint) {
      return NextResponse.json(
        { success: false, error: 'クレームが見つかりません' },
        { status: 404 }
      );
    }

    const actions = listActions(id);

    return NextResponse.json({
      success: true,
      actions,
    });
  } catch (error) {
    console.error('アクション取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アクションの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!canManageComplaints(DEMO_USER)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { title, ownerUserId, dueAt } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'タイトルを入力してください' },
        { status: 400 }
      );
    }

    const result = createAction(id, { title, ownerUserId, dueAt }, DEMO_USER.userId);

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
    console.error('アクション作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アクションの作成に失敗しました' },
      { status: 500 }
    );
  }
}
