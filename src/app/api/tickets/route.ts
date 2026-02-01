/**
 * チケットAPI
 *
 * GET /api/tickets - 一覧取得
 * POST /api/tickets - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { listTickets, createTicket } from '@/lib/tickets/repo';
import type { AppRole } from '@/config/appRoles';
import type { TicketStatus, TicketPriority, TicketCategory } from '@/lib/tickets/types';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') as TicketStatus | null;
    const priority = searchParams.get('priority') as TicketPriority | null;
    const category = searchParams.get('category') as TicketCategory | null;
    const q = searchParams.get('q');
    const my = searchParams.get('my') as 'assigned' | 'requested' | 'watching' | null;
    const overdueParam = searchParams.get('overdue');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const filter = {
      status: status ?? undefined,
      priority: priority ?? undefined,
      category: category ?? undefined,
      q: q ?? undefined,
      my: my ?? undefined,
      overdue: overdueParam === 'true' ? true : undefined,
      limit: limitParam ? parseInt(limitParam, 10) : 50,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    };

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    const { items, total } = listTickets(filter, viewer);

    return NextResponse.json({
      items,
      totalCount: total,
      limit: filter.limit,
      offset: filter.offset,
    });
  } catch (error) {
    console.error('tickets GET error:', error);
    return NextResponse.json(
      { error: 'チケットの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      title,
      description,
      priority,
      category,
      dueAt,
      tags,
      relatedType,
      relatedId,
      location,
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'タイトルと説明は必須です' },
        { status: 400 }
      );
    }

    const ticket = createTicket(
      {
        title,
        description,
        priority,
        category,
        dueAt,
        tags,
        relatedType,
        relatedId,
        location,
      },
      DEMO_USER.id
    );

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error('tickets POST error:', error);
    return NextResponse.json(
      { error: 'チケットの作成に失敗しました' },
      { status: 500 }
    );
  }
}
