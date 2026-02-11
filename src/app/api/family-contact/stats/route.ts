/**
 * 家族連絡ログ統計 API
 *
 * GET /api/family-log/stats - 統計取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { getFamilyLogStats } from '@/lib/familyLog/repo';
import { canViewFamilyLogStats } from '@/lib/familyLog/types';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // 権限チェック
    if (!canViewFamilyLogStats(user.role as AppRole)) {
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
