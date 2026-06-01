/**
 * チケットイベント（履歴）API
 *
 * GET /api/tickets/[id]/events
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getTicketById, listTicketEvents } from '@/lib/tickets/repo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const viewer = { userId: currentUser.id, role: currentUser.role };

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
