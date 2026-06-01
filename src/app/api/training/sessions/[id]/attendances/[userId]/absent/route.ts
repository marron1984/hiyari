/**
 * 研修欠席記録API
 *
 * POST /api/training/sessions/[id]/attendances/[userId]/absent
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { markAbsent } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id: sessionId, userId } = await params;
    const viewer = { userId: currentUser.id, role: currentUser.role };

    if (!canManageTraining(viewer)) {
      return NextResponse.json(
        { error: '欠席を記録する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { note } = body;

    const result = markAbsent(
      sessionId,
      userId,
      currentUser.id,
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
