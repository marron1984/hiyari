/**
 * チケットステータス変更API
 *
 * POST /api/tickets/[id]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { changeTicketStatus } from '@/lib/tickets/repo';
import type { TicketStatus } from '@/lib/tickets/types';

const VALID_STATUSES: TicketStatus[] = [
  'open',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
  'archived',
];

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

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: '有効なステータスを指定してください' },
        { status: 400 }
      );
    }

    const viewer = { userId: currentUser.id, role: currentUser.role };
    const result = changeTicketStatus(id, status, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ ticket: result.ticket });
  } catch (error) {
    console.error('ticket status POST error:', error);
    return NextResponse.json(
      { error: 'ステータス変更に失敗しました' },
      { status: 500 }
    );
  }
}
