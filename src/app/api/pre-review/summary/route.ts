// ======== 決裁前レビューサマリ API（吉田向け） ========

import { NextRequest, NextResponse } from 'next/server';
import { generatePreReviewSummary } from '@/lib/pre-review';

/**
 * GET /api/pre-review/summary
 * 吉田向けサマリを取得
 *
 * Query Parameters:
 * - tenantId: string (default: 'default')
 * - days: number (default: 7) - 集計期間（日数）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const days = parseInt(searchParams.get('days') || '7', 10);

    const summary = await generatePreReviewSummary(tenantId, days);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error('[PreReview] サマリ取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
