// ======== 人材リスク評価詳細 API ========

import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/human-risk';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/human-risk/[id]
 * 評価詳細を取得
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const assessment = await getAssessment(id);

    if (!assessment) {
      return NextResponse.json(
        { success: false, error: '評価が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      assessment: {
        ...assessment,
        assessedAt: assessment.assessedAt.toISOString(),
        createdAt: assessment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[HumanRisk] 詳細取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
