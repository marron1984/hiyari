/**
 * チケット担当解除API
 *
 * POST /api/tickets/[id]/unassign
 */

import { NextRequest, NextResponse } from 'next/server';
import { unassignTicket } from '@/lib/tickets/repo';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;
    const viewer = { userId: user.uid, role: user.role as AppRole };

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
