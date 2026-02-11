/**
 * 研修セッション統計API
 *
 * GET /api/training/sessions/[id]/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionStats } from '@/lib/training/repo.firestore';
import { canViewAllStats } from '@/lib/training/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id: sessionId } = await params;
    const viewer = { userId: user.uid, role: user.role as AppRole };

    if (!canViewAllStats(viewer)) {
      return NextResponse.json(
        { error: '統計を閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const stats = await getSessionStats(sessionId);

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
