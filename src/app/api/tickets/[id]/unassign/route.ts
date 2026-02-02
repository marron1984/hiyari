/**
 * チケット担当解除API
 *
 * POST /api/tickets/[id]/unassign
 */

import { NextRequest, NextResponse } from 'next/server';
import { unassignTicket } from '@/lib/tickets/repo';
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
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };

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
