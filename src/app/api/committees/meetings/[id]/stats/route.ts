/**
 * 開催統計API
 *
 * GET /api/committees/meetings/[id]/stats - 開催統計取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMeetingStats } from '@/lib/committees/repo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const stats = getMeetingStats(id);

    if (!stats) {
      return NextResponse.json(
        { success: false, error: '開催回が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('開催統計取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
