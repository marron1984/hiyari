/**
 * 研修出席記録API
 *
 * POST /api/training/sessions/[id]/attendances/[userId]/attended
 */

import { NextRequest, NextResponse } from 'next/server';
import { markAttended } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id: sessionId, userId } = await params;
    const viewer = { userId: user.uid, role: user.role as AppRole };

    if (!canManageTraining(viewer)) {
      return NextResponse.json(
        { error: '出席を記録する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { attendedAt, evidenceNote } = body;

    const result = markAttended(
      sessionId,
      userId,
      attendedAt ?? null,
      user.uid,
      evidenceNote
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({ attendance: result.attendance });
  } catch (error) {
    console.error('training attended POST error:', error);
    return NextResponse.json(
      { error: '出席記録に失敗しました' },
      { status: 500 }
    );
  }
}
