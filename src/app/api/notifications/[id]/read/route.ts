/**
 * 通知既読API
 *
 * POST /api/notifications/{id}/read - 特定の通知を既読にする
 * Implementation Ticket 036: Notifications 永続化（DB化）
 */

import { NextRequest, NextResponse } from 'next/server';
import { markRead, getById } from '@/lib/notifications/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_manager',
  name: '田中管理者',
  role: 'manager' as AppRole,
};

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: '通知IDが指定されていません' },
        { status: 400 }
      );
    }

    // 通知の存在確認
    const notification = getById(id);
    if (!notification) {
      return NextResponse.json(
        { error: '通知が見つかりません' },
        { status: 404 }
      );
    }

    // 既読にする
    const result = markRead(id, DEMO_USER.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      notification: result.notification,
      message: '通知を既読にしました',
    });
  } catch (error) {
    console.error('notifications read POST error:', error);
    return NextResponse.json(
      { error: '既読処理に失敗しました' },
      { status: 500 }
    );
  }
}
