/**
 * 家族連絡ログ統計 API
 *
 * GET /api/family-log/stats - 統計取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getFamilyLogStats } from '@/lib/familyLog/repo';
import { canViewFamilyLogStats } from '@/lib/familyLog/types';
import type { ViewerContext } from '@/lib/familyLog/types';

// デモユーザー
const currentUser: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェック
    if (!canViewFamilyLogStats(currentUser.role)) {
      return NextResponse.json(
        { error: '統計閲覧権限がありません' },
        { status: 403 }
      );
    }

    const stats = getFamilyLogStats();

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Error fetching family log stats:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
