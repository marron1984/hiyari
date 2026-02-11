/**
 * 研修受講記録一覧API
 *
 * GET /api/training/sessions/[id]/attendances
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAttendances, getSession } from '@/lib/training/repo.firestore';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const { id: sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: '研修セッションが見つかりません' },
        { status: 404 }
      );
    }

    const attendances = await listAttendances(sessionId);

    return NextResponse.json({ attendances });
  } catch (error) {
    console.error('training attendances GET error:', error);
    return NextResponse.json(
      { error: '受講記録の取得に失敗しました' },
      { status: 500 }
    );
  }
}
