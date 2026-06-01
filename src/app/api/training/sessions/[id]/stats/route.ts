/**
 * 研修セッション統計API
 *
 * GET /api/training/sessions/[id]/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getSessionStats } from '@/lib/training/repo';
import { canViewAllStats } from '@/lib/training/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id: sessionId } = await params;
    const viewer = { userId: currentUser.id, role: currentUser.role };

    if (!canViewAllStats(viewer)) {
      return NextResponse.json(
        { error: '統計を閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const stats = getSessionStats(sessionId);

    if (!stats) {
      return NextResponse.json(
        { error: '研修セッションが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('training stats GET error:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
