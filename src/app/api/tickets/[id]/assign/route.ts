/**
 * チケット担当割当API
 *
 * POST /api/tickets/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { assignTicket } from '@/lib/tickets/repo';

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
    const { assigneeUserId } = body;

    if (!assigneeUserId) {
      return NextResponse.json(
        { error: '担当者IDは必須です' },
        { status: 400 }
      );
    }

    const viewer = { userId: currentUser.id, role: currentUser.role };
    const result = assignTicket(id, assigneeUserId, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    // TODO: 通知センターへ割当通知を送信
    // createNotification({
    //   userId: assigneeUserId,
    //   type: 'task',
    //   title: `チケットが割り当てられました：${result.ticket.title}`,
    //   ...
    // });

    return NextResponse.json({ ticket: result.ticket });
  } catch (error) {
    console.error('ticket assign POST error:', error);
    return NextResponse.json(
      { error: '担当割当に失敗しました' },
      { status: 500 }
    );
  }
}
