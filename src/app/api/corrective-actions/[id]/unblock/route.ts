/**
 * POST /api/corrective-actions/[id]/unblock
 *
 * Ticket 131: ブロック解除
 *
 * body:
 * { status: 'open' | 'in_progress' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { unblockAction } from '@/lib/correctiveActions/repo';

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
    const body = await request.json();

    const { status } = body;

    if (!status || !['open', 'in_progress'].includes(status)) {
      return NextResponse.json(
        { error: 'status は open または in_progress を指定してください' },
        { status: 400 }
      );
    }

    const viewer = { userId: currentUser.id, role: currentUser.role };
    const result = unblockAction(id, status, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      item: result.item,
      event: result.event,
    });
  } catch (error) {
    console.error('corrective-actions unblock POST error:', error);
    return NextResponse.json(
      { error: 'ブロック解除に失敗しました' },
      { status: 500 }
    );
  }
}
