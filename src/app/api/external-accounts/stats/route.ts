/**
 * 外部アカウント統計 API
 * GET /api/external-accounts/stats - 統計取得（admin+）
 */

import { NextResponse } from 'next/server';
import * as repo from '@/lib/external-accounts/repo';
import type { ViewerContext } from '@/lib/external-accounts/types';

export async function GET() {
  try {
    const viewer: ViewerContext = {
      userId: 'user_admin',
      role: 'admin',
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
    console.error('External Accounts Stats Error:', error);
    return NextResponse.json(
      { success: false, error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
