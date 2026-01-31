// ======== 月次決算AIレビュー個別操作 API ========

import { NextRequest, NextResponse } from 'next/server';
import {
  getMonthlyAIReviewById,
  acknowledgeMonthlyReview,
} from '@/lib/monthly-closing';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/admin/monthly-closing/[id]
 * 月次決算AIレビューの詳細を取得
 */
export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;

    const review = await getMonthlyAIReviewById(id);
    if (!review) {
      return NextResponse.json(
        { error: 'レビューが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      review: {
        ...review,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
        reviewedAt: review.reviewedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('[MonthlyClosing] 詳細取得エラー:', error);
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
 * POST /api/admin/monthly-closing/[id]
 * レビューを確認済みにする
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;

    const body = await request.json();
    const { note } = body as { note?: string };

    // 確認済みにする（管理者情報は簡易的に設定）
    await acknowledgeMonthlyReview(id, 'admin', '管理者', note);

    return NextResponse.json({
      success: true,
      message: 'レビューを確認済みにしました',
    });
  } catch (error) {
    console.error('[MonthlyClosing] 確認エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '操作に失敗しました',
      },
      { status: 500 }
    );
  }
}
