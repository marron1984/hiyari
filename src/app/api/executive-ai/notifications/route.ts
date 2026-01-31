// ======== 幹部AI 吉田通知API ========

import { NextRequest, NextResponse } from 'next/server';
import {
  getYoshidaNotifications,
  acknowledgeNotification,
} from '@/lib/executive-ai';

/**
 * GET /api/executive-ai/notifications
 * 吉田向け通知一覧を取得
 *
 * Query Parameters:
 * - tenantId: string (default: 'default')
 * - status: 'unread' | 'read' | 'acknowledged' | 'resolved' (オプション)
 * - limit: number (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const status = searchParams.get('status') as
      | 'unread'
      | 'read'
      | 'acknowledged'
      | 'resolved'
      | null;
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const notifications = await getYoshidaNotifications(tenantId, {
      status: status || undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      notifications: notifications.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString(),
        acknowledgedAt: n.acknowledgedAt?.toISOString(),
        resolvedAt: n.resolvedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[ExecutiveAI/Notifications] 取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/executive-ai/notifications
 * 通知を確認済みにする（吉田用）
 *
 * Request Body:
 * - notificationId: string (必須)
 * - response: string (オプション、吉田からの返答)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationId, response } = body;

    // バリデーション
    if (!notificationId || typeof notificationId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'notificationId は必須です' },
        { status: 400 }
      );
    }

    await acknowledgeNotification(notificationId, response);

    return NextResponse.json({
      success: true,
      message: '通知を確認済みにしました',
    });
  } catch (error) {
    console.error('[ExecutiveAI/Notifications] 更新エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新に失敗しました',
      },
      { status: 500 }
    );
  }
}
