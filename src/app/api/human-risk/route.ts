// ======== 人材リスク予測 API ========

import { NextRequest, NextResponse } from 'next/server';
import { getRiskSummaries, getLatestAssessmentForBranch } from '@/lib/human-risk';

/**
 * GET /api/human-risk
 * 拠点リスクサマリ一覧を取得
 *
 * Query Parameters:
 * - tenantId: string (default: 'default')
 * - branchId: string (任意、指定時はその拠点の最新評価を返す)
 * - limit: number (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const branchId = searchParams.get('branchId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // 特定拠点の最新評価
    if (branchId) {
      const assessment = await getLatestAssessmentForBranch(tenantId, branchId);

      if (!assessment) {
        return NextResponse.json({
          success: true,
          assessment: null,
          message: 'この拠点の評価データがありません',
        });
      }

      return NextResponse.json({
        success: true,
        assessment: {
          ...assessment,
          assessedAt: assessment.assessedAt.toISOString(),
          createdAt: assessment.createdAt.toISOString(),
        },
      });
    }

    // 一覧取得
    const summaries = await getRiskSummaries(tenantId, { limit });

    return NextResponse.json({
      success: true,
      summaries,
      total: summaries.length,
    });
  } catch (error) {
    console.error('[HumanRisk] 取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
