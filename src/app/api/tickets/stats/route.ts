/**
 * チケット統計API
 *
 * GET /api/tickets/stats
 * GET /api/tickets/stats?businessUnitId=xxx  (Task 030)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTicketStats } from '@/lib/tickets/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Task 030: businessUnitId フィルタ
    const businessUnitIdParam = searchParams.get('businessUnitId');
    // 'null' 文字列は未分類を意味する
    const businessUnitId = businessUnitIdParam === 'null'
      ? null
      : (businessUnitIdParam ?? undefined);

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
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
