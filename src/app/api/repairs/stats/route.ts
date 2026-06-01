/**
 * 修繕統計API
 *
 * GET /api/repairs/stats
 * GET /api/repairs/stats?businessUnitId=xxx  (Task 030)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getStats } from '@/lib/repairs/repo';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Task 030: businessUnitId フィルタ
    const businessUnitIdParam = searchParams.get('businessUnitId');
    // 'null' 文字列は未分類を意味する
    const businessUnitId = businessUnitIdParam === 'null'
      ? null
      : (businessUnitIdParam ?? undefined);

    const viewer = { userId: currentUser.id, role: currentUser.role };
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
