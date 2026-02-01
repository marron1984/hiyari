/**
 * チケット詳細API
 *
 * GET /api/tickets/[id] - 詳細取得
 * PATCH /api/tickets/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTicketById, updateTicket } from '@/lib/tickets/repo';
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

    const result = getTicketById(id, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ ticket: result.ticket });
  } catch (error) {
    console.error('ticket GET error:', error);
    return NextResponse.json(
      { error: 'チケットの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };

    const { title, description, priority, category, dueAt, tags, location } = body;

    const result = updateTicket(
      id,
      { title, description, priority, category, dueAt, tags, location },
      viewer
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ ticket: result.ticket });
  } catch (error) {
    console.error('ticket PATCH error:', error);
    return NextResponse.json(
      { error: 'チケットの更新に失敗しました' },
      { status: 500 }
    );
  }
}
