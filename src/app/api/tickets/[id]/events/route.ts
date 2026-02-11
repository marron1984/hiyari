/**
 * チケットイベント（履歴）API
 *
 * GET /api/tickets/[id]/events
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTicketById, listTicketEvents } from '@/lib/tickets/repo';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;
    const viewer = { userId: user.uid, role: user.role as AppRole };

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
