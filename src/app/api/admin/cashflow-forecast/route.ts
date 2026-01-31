// ======== キャッシュフロー予測 API ========

import { NextRequest, NextResponse } from 'next/server';
import {
  generateCashflowAIReview,
  listCashflowAIReviews,
  getLatestCashflowAIReview,
} from '@/lib/cashflow-forecast';
import type { ForecastPeriod } from '@/types/cashflow-forecast';

/**
 * GET /api/admin/cashflow-forecast
 * キャッシュフローAIレビュー一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const latest = searchParams.get('latest') === 'true';

    if (latest) {
      // 最新のレビューのみ取得
      const review = await getLatestCashflowAIReview(tenantId);
      if (!review) {
        return NextResponse.json({
          success: true,
          review: null,
        });
      }

      return NextResponse.json({
        success: true,
        review: {
          ...review,
          createdAt: review.createdAt.toISOString(),
          updatedAt: review.updatedAt.toISOString(),
          reviewedAt: review.reviewedAt?.toISOString(),
          forecast: {
            ...review.forecast,
            generatedAt: review.forecast.generatedAt.toISOString(),
          },
        },
      });
    }

    // 一覧取得
    const reviews = await listCashflowAIReviews(tenantId, limit);

    return NextResponse.json({
      success: true,
      reviews: reviews.map((review) => ({
        ...review,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
        reviewedAt: review.reviewedAt?.toISOString(),
        forecast: {
          ...review.forecast,
          generatedAt: review.forecast.generatedAt.toISOString(),
        },
      })),
    });
  } catch (error) {
    console.error('[CashflowForecast] 一覧取得エラー:', error);
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
 * POST /api/admin/cashflow-forecast
 * キャッシュフロー予測を生成
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId = 'default', period = '1month', currentBalance } = body;

    // 期間のバリデーション
    const validPeriods: ForecastPeriod[] = ['1week', '2weeks', '1month', '3months'];
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        { error: '有効な period を指定してください（1week, 2weeks, 1month, 3months）' },
        { status: 400 }
      );
    }

    // AIレビュー生成
    const review = await generateCashflowAIReview(
      tenantId,
      period as ForecastPeriod,
      currentBalance ? parseFloat(currentBalance) : undefined
    );

    return NextResponse.json({
      success: true,
      review: {
        ...review,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
        forecast: {
          ...review.forecast,
          generatedAt: review.forecast.generatedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('[CashflowForecast] 生成エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成に失敗しました',
      },
      { status: 500 }
    );
  }
}
