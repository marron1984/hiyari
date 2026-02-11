/**
 * GET /api/corrective-actions/[id]/events
 *
 * Ticket 131: イベントログ取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listEvents, getById } from '@/lib/correctiveActions/repo.firestore';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  try {
    const { id } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    const result = await getById(id, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    const events = await listEvents(id);
    return NextResponse.json({ events });
  } catch (error) {
    console.error('corrective-actions events GET error:', error);
    return NextResponse.json(
      { error: 'イベントの取得に失敗しました' },
      { status: 500 }
    );
  }
}
