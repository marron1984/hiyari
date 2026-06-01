/**
 * クレーム統計API
 *
 * GET /api/complaints/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getStats } from '@/lib/complaints/repo';
import { canViewComplaintStats } from '@/lib/complaints/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!canViewComplaintStats(currentUser)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const stats = getStats(currentUser);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('統計取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
