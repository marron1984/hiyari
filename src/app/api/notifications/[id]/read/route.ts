/**
 * 通知既読API
 *
 * POST /api/notifications/{id}/read - 特定の通知を既読にする
 * Implementation Ticket 036: Notifications 永続化（DB化）
 */

import { NextRequest, NextResponse } from 'next/server';
import { markRead, getById } from '@/lib/notifications/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

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
    const result = markRead(id, user.uid);

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
