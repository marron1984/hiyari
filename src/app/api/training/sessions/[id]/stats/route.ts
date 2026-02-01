/**
 * 研修セッション統計API
 *
 * GET /api/training/sessions/[id]/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionStats } from '@/lib/training/repo';
import { canViewAllStats } from '@/lib/training/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };

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
