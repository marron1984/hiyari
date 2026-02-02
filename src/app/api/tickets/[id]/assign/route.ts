/**
 * チケット担当割当API
 *
 * POST /api/tickets/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { assignTicket } from '@/lib/tickets/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { assigneeUserId } = body;

    if (!assigneeUserId) {
      return NextResponse.json(
        { error: '担当者IDは必須です' },
        { status: 400 }
      );
    }

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
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
