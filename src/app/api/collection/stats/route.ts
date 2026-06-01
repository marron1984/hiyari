/**
 * 回収フロー統計 API
 *
 * GET /api/collection/stats - 統計取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getStats } from '@/lib/collection/repo';
import { canViewStats } from '@/lib/collection/types';
import type { ViewerContext } from '@/lib/collection/types';
export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!canViewStats(currentUser.role)) {
      return NextResponse.json(
        { error: '統計閲覧権限がありません' },
        { status: 403 }
      );
    }

    const stats = getStats(currentUser);

    if (!stats) {
      return NextResponse.json(
        { error: '統計の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
