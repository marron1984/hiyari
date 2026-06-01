/**
 * GET /api/corrective-actions/[id]/events
 *
 * Ticket 131: イベントログ取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { listEvents, getById } from '@/lib/correctiveActions/repo';

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
    const result = getById(id, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    const events = listEvents(id);
    return NextResponse.json({ events });
  } catch (error) {
    console.error('corrective-actions events GET error:', error);
    return NextResponse.json(
      { error: 'イベントの取得に失敗しました' },
      { status: 500 }
    );
  }
}
