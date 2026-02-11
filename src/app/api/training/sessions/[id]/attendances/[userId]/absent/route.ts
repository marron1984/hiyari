/**
 * 研修欠席記録API
 *
 * POST /api/training/sessions/[id]/attendances/[userId]/absent
 */

import { NextRequest, NextResponse } from 'next/server';
import { markAbsent } from '@/lib/training/repo.firestore';
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
        { error: '欠席を記録する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { note } = body;

    const result = await markAbsent(
      sessionId,
      userId,
      user.uid,
      note
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({ attendance: result.attendance });
  } catch (error) {
    console.error('training absent POST error:', error);
    return NextResponse.json(
      { error: '欠席記録に失敗しました' },
      { status: 500 }
    );
  }
}
