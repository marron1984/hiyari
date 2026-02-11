/**
 * 回収フロー統計 API
 *
 * GET /api/collection/stats - 統計取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStats } from '@/lib/collection/repo';
import { canViewStats } from '@/lib/collection/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canViewStats(user.role as any)) {
      return NextResponse.json(
        { error: '統計閲覧権限がありません' },
        { status: 403 }
      );
    }

    const stats = getStats({ userId: user.uid, role: user.role as any });

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
