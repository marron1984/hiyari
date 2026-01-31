// ======== 月次決算AIチェック API ========

import { NextRequest, NextResponse } from 'next/server';
import {
  generateMonthlyAIReview,
  listMonthlyAIReviews,
} from '@/lib/monthly-closing';

/**
 * GET /api/admin/monthly-closing
 * 月次決算AIレビュー一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const limit = parseInt(searchParams.get('limit') || '12', 10);

    const reviews = await listMonthlyAIReviews(tenantId, limit);

    return NextResponse.json({
      success: true,
      reviews: reviews.map((review) => ({
        ...review,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
        reviewedAt: review.reviewedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[MonthlyClosing] 一覧取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/monthly-closing
 * 月次決算AIレビューを生成
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId = 'default', year, month } = body;

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year と month は必須です' },
        { status: 400 }
      );
    }

    // 年月のバリデーション
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    if (
      isNaN(yearNum) ||
      isNaN(monthNum) ||
      monthNum < 1 ||
      monthNum > 12 ||
      yearNum < 2020 ||
      yearNum > 2100
    ) {
      return NextResponse.json(
        { error: '有効な year と month を指定してください' },
        { status: 400 }
      );
    }

    // yearMonth 形式に変換
    const yearMonth = `${yearNum}-${String(monthNum).padStart(2, '0')}`;

    // AIレビュー生成
    const review = await generateMonthlyAIReview(tenantId, yearMonth);

    return NextResponse.json({
      success: true,
      review: {
        ...review,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[MonthlyClosing] 生成エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成に失敗しました',
      },
      { status: 500 }
    );
  }
}
