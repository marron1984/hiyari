/**
 * 修繕統計API
 *
 * GET /api/repairs/stats
 * GET /api/repairs/stats?businessUnitId=xxx  (Task 030)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStats } from '@/lib/repairs/repo';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);

    // Task 030: businessUnitId フィルタ
    const businessUnitIdParam = searchParams.get('businessUnitId');
    // 'null' 文字列は未分類を意味する
    const businessUnitId = businessUnitIdParam === 'null'
      ? null
      : (businessUnitIdParam ?? undefined);

    const viewer = { userId: user.uid, role: user.role as AppRole };
    const stats = getStats(viewer, { businessUnitId });

    return NextResponse.json(stats);
  } catch (error) {
    console.error('repairs stats GET error:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
