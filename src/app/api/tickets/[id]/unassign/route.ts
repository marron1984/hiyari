/**
 * チケット担当解除API
 *
 * POST /api/tickets/[id]/unassign
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { unassignTicket } from '@/lib/tickets/repo';

export async function POST(
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

    const result = unassignTicket(id, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ ticket: result.ticket });
  } catch (error) {
    console.error('ticket unassign POST error:', error);
    return NextResponse.json(
      { error: '担当解除に失敗しました' },
      { status: 500 }
    );
  }
}
