// ======== 決裁前レビューログ API ========

import { NextRequest, NextResponse } from 'next/server';
import { getPreReviewLogs } from '@/lib/pre-review';
import type { ApplicationType } from '@/types/pre-review';

/**
 * GET /api/pre-review/logs
 * プレレビューログ一覧を取得
 *
 * Query Parameters:
 * - tenantId: string (default: 'default')
 * - applicationType: 'expense' | 'overtime' (任意)
 * - applicantId: string (任意)
 * - branchId: string (任意)
 * - limit: number (default: 20)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const applicationType = searchParams.get('applicationType') as ApplicationType | null;
    const applicantId = searchParams.get('applicantId') || undefined;
    const branchId = searchParams.get('branchId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { logs, total } = await getPreReviewLogs(tenantId, {
      applicationType: applicationType || undefined,
      applicantId,
      branchId,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      logs: logs.map((log) => ({
        ...log,
        reviewedAt: log.reviewedAt.toISOString(),
        submittedAt: log.submittedAt?.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[PreReview] ログ取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
