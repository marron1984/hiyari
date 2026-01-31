// ======== 人材リスクアラート API ========

import { NextRequest, NextResponse } from 'next/server';
import { getRiskAlerts, acknowledgeAlert } from '@/lib/human-risk';

/**
 * GET /api/human-risk/alerts
 * アラート一覧を取得（警戒以上のみ）
 *
 * Query Parameters:
 * - tenantId: string (default: 'default')
 * - status: 'unread' | 'read' | 'acknowledged' (任意)
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
      | null;
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const { alerts, unreadCount } = await getRiskAlerts(tenantId, {
      status: status || undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      alerts: alerts.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        readAt: a.readAt?.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString(),
      })),
      unreadCount,
    });
  } catch (error) {
    console.error('[HumanRisk/Alerts] 取得エラー:', error);
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
 * PUT /api/human-risk/alerts
 * アラートを確認済みにする
 *
 * Request Body:
 * - alertId: string (必須)
 * - acknowledgedBy: string (必須)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { alertId, acknowledgedBy } = body;

    if (!alertId || typeof alertId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'alertId は必須です' },
        { status: 400 }
      );
    }

    if (!acknowledgedBy || typeof acknowledgedBy !== 'string') {
      return NextResponse.json(
        { success: false, error: 'acknowledgedBy は必須です' },
        { status: 400 }
      );
    }

    await acknowledgeAlert(alertId, acknowledgedBy);

    return NextResponse.json({
      success: true,
      message: 'アラートを確認済みにしました',
    });
  } catch (error) {
    console.error('[HumanRisk/Alerts] 更新エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新に失敗しました',
      },
      { status: 500 }
    );
  }
}
