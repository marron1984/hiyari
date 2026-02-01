/**
 * チケットイベント（履歴）API
 *
 * GET /api/tickets/[id]/events
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTicketById, listTicketEvents } from '@/lib/tickets/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };

    // チケットの存在とアクセス権確認
    const ticketResult = getTicketById(id, viewer);
    if (!ticketResult.success) {
      return NextResponse.json(
        { error: ticketResult.error },
        { status: ticketResult.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    const events = listTicketEvents(id);

    return NextResponse.json({ events });
  } catch (error) {
    console.error('ticket events GET error:', error);
    return NextResponse.json(
      { error: '履歴の取得に失敗しました' },
      { status: 500 }
    );
  }
}
