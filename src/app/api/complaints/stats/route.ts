/**
 * クレーム統計API
 *
 * GET /api/complaints/stats
 */

import { NextResponse } from 'next/server';
import { getStats } from '@/lib/complaints/repo';
import { canViewComplaintStats } from '@/lib/complaints/types';

const DEMO_USER = {
  userId: 'user_manager',
  role: 'manager' as const,
};

export async function GET() {
  try {
    if (!canViewComplaintStats(DEMO_USER)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const stats = getStats(DEMO_USER);

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
