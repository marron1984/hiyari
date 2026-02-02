/**
 * 未収統計 API
 *
 * GET /api/receivables/stats
 */

import { NextResponse } from 'next/server';
import { getStats } from '@/lib/receivables/repo';
import { canViewStats } from '@/lib/receivables/types';
import type { ViewerContext } from '@/lib/receivables/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET() {
  try {
    // 権限チェック
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
