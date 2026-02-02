/**
 * 同意書統計 API
 * GET /api/agreements/stats - 統計取得（manager+）
 */

import { NextResponse } from 'next/server';
import * as repo from '@/lib/agreements/repo';
import type { ViewerContext } from '@/lib/agreements/types';

export async function GET() {
  try {
    const viewer: ViewerContext = {
      userId: 'user_manager',
      role: 'manager',
    };

    const stats = repo.getStats(viewer);

    if (!stats) {
      return NextResponse.json(
        { success: false, error: '統計を取得する権限がありません' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('Agreement Stats Error:', error);
    return NextResponse.json(
      { success: false, error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
