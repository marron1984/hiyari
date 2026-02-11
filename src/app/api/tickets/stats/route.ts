/**
 * チケット統計API
 *
 * GET /api/tickets/stats
 * GET /api/tickets/stats?businessUnitId=xxx  (Task 030)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTicketStats } from '@/lib/tickets/repo';
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
    const stats = getTicketStats(viewer, { businessUnitId });

    return NextResponse.json(stats);
  } catch (error) {
    console.error('tickets stats GET error:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
