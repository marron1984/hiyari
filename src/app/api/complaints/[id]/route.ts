/**
 * クレーム詳細・更新API
 *
 * GET   /api/complaints/[id] - 詳細取得
 * PATCH /api/complaints/[id] - 更新（manager+ or assignee）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getComplaintById,
  updateComplaint,
  listComments,
  listActions,
  getEvents,
} from '@/lib/complaints/repo';
import { canEditComplaint } from '@/lib/complaints/types';

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
    const complaint = getComplaintById(id, DEMO_USER);

    if (!complaint) {
      return NextResponse.json(
        { success: false, error: 'クレームが見つかりません' },
        { status: 404 }
      );
    }

    const comments = listComments(id);
    const actions = listActions(id);
    const events = getEvents(id);

    return NextResponse.json({
      success: true,
      complaint,
      comments,
      actions,
      events,
    });
  } catch (error) {
    console.error('クレーム詳細取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クレームの取得に失敗しました' },
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
    const complaint = getComplaintById(id, DEMO_USER);

    if (!complaint) {
      return NextResponse.json(
        { success: false, error: 'クレームが見つかりません' },
        { status: 404 }
      );
    }

    if (!canEditComplaint(DEMO_USER, complaint)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = updateComplaint(id, body, DEMO_USER.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      complaint: result.complaint,
    });
  } catch (error) {
    console.error('クレーム更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クレームの更新に失敗しました' },
      { status: 500 }
    );
  }
}
