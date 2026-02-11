/**
 * 通知API
 *
 * GET /api/notifications - 通知一覧取得
 * Task 033: 未分類スコープ通知対応
 * Implementation Ticket 036: DB永続化対応
 */

import { NextRequest, NextResponse } from 'next/server';
import { listByRole, getUnreadCountByRole } from '@/lib/notifications/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { NotificationType } from '@/types/notification';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);

    const statusParam = searchParams.get('status');
    const typeParam = searchParams.get('type');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    // ステータスフィルタ（unread/read/dismissed/all）
    const status = statusParam === 'read' ? 'read' :
                   statusParam === 'unread' ? 'unread' :
                   statusParam === 'dismissed' ? 'dismissed' : 'all';

    // ページネーション制限（DoS防止）
    const limit = Math.min(Math.max(limitParam ? parseInt(limitParam, 10) : 50, 1), 100);
    const offset = Math.max(offsetParam ? parseInt(offsetParam, 10) : 0, 0);

    const { items, total, unreadCount } = listByRole(user.role, {
      status: status as 'unread' | 'read' | 'all',
      type: (typeParam || undefined) as NotificationType | undefined,
      limit,
      offset,
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
