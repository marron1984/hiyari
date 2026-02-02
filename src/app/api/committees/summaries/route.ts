/**
 * 委員会サマリーAPI
 *
 * GET /api/committees/summaries - 委員会サマリー一覧取得
 */

import { NextResponse } from 'next/server';
import { getCommitteeSummaries } from '@/lib/committees/repo';

export async function GET() {
  try {
    const summaries = getCommitteeSummaries();

    return NextResponse.json({
      success: true,
      summaries,
      total: summaries.length,
    });
  } catch (error) {
    console.error('委員会サマリー取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '委員会サマリーの取得に失敗しました' },
      { status: 500 }
    );
  }
}
