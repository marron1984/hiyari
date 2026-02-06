/**
 * GET /api/corrective-actions/[id]/events
 *
 * Ticket 131: イベントログ取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listEvents, getById } from '@/lib/correctiveActions/repo';
import type { AppRole } from '@/config/appRoles';

const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
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
