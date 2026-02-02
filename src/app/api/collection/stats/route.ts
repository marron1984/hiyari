/**
 * 回収フロー統計 API
 *
 * GET /api/collection/stats - 統計取得
 */

import { NextResponse } from 'next/server';
import { getStats } from '@/lib/collection/repo';
import { canViewStats } from '@/lib/collection/types';
import type { ViewerContext } from '@/lib/collection/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET() {
  try {
    if (!canViewStats(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '統計閲覧権限がありません' },
        { status: 403 }
      );
    }

    const stats = getStats(DEMO_VIEWER);

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
