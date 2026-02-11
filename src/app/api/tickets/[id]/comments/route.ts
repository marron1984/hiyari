/**
 * チケットコメントAPI
 *
 * GET /api/tickets/[id]/comments - コメント一覧
 * POST /api/tickets/[id]/comments - コメント追加
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTicketById,
  listTicketComments,
  addTicketComment,
} from '@/lib/tickets/repo';
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

    const comments = listTicketComments(id);

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('ticket comments GET error:', error);
    return NextResponse.json(
      { error: 'コメントの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'メッセージは必須です' },
        { status: 400 }
      );
    }

    const viewer = { userId: user.uid, role: user.role as AppRole };
    const result = addTicketComment(id, message, user.uid, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    // TODO: 通知センターへコメント通知を送信
    // requesterとassignee（自分以外）に通知

    return NextResponse.json({ comment: result.comment }, { status: 201 });
  } catch (error) {
    console.error('ticket comments POST error:', error);
    return NextResponse.json(
      { error: 'コメントの追加に失敗しました' },
      { status: 500 }
    );
  }
}
