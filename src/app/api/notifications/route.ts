/**
 * 通知API
 *
 * GET /api/notifications - 通知一覧取得
 * Task 033: 未分類スコープ通知対応
 * Implementation Ticket 036: DB永続化対応
 */

import { NextRequest, NextResponse } from 'next/server';
import { listByRole, getUnreadCountByRole } from '@/lib/notifications/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_manager',
  name: '田中管理者',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const statusParam = searchParams.get('status');
    const typeParam = searchParams.get('type');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    // ステータスフィルタ（unread/read/dismissed/all）
    const status = statusParam === 'read' ? 'read' :
                   statusParam === 'unread' ? 'unread' :
                   statusParam === 'dismissed' ? 'dismissed' : 'all';

    const { items, total, unreadCount } = listByRole(DEMO_USER.role, {
      status: status as 'unread' | 'read' | 'all',
      type: typeParam as any,
      limit: limitParam ? parseInt(limitParam, 10) : 50,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    });

    return NextResponse.json({
      success: true,
      items,
      total,
      unreadCount,
    });
  } catch (error) {
    console.error('notifications GET error:', error);
    return NextResponse.json(
      { error: '通知の取得に失敗しました' },
      { status: 500 }
    );
  }
}
