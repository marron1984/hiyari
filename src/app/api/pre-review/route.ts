// ======== 決裁前レビューゲート API ========

import { NextRequest, NextResponse } from 'next/server';
import { runPreReview } from '@/lib/pre-review';
import type {
  ApplicationType,
  ExpenseApplication,
  OvertimeApplication,
} from '@/types/pre-review';

/**
 * POST /api/pre-review
 * 申請のプレレビューを実行
 *
 * Request Body:
 * - applicationType: 'expense' | 'overtime' (必須)
 * - application: ExpenseApplication | OvertimeApplication (必須)
 * - tenantId: string (default: 'default')
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { applicationType, application, tenantId = 'default' } = body;

    // バリデーション
    if (!applicationType || !['expense', 'overtime'].includes(applicationType)) {
      return NextResponse.json(
        { success: false, error: 'applicationType は expense または overtime を指定してください' },
        { status: 400 }
      );
    }

    if (!application) {
      return NextResponse.json(
        { success: false, error: 'application は必須です' },
        { status: 400 }
      );
    }

    // 経費申請のバリデーション
    if (applicationType === 'expense') {
      const exp = application as ExpenseApplication;
      if (!exp.amount || typeof exp.amount !== 'number') {
        return NextResponse.json(
          { success: false, error: 'amount は必須です（数値）' },
          { status: 400 }
        );
      }
      if (!exp.title) {
        return NextResponse.json(
          { success: false, error: 'title は必須です' },
          { status: 400 }
        );
      }
    }

    // 残業申請のバリデーション
    if (applicationType === 'overtime') {
      const ot = application as OvertimeApplication;
      if (!ot.date || !ot.startTime || !ot.endTime) {
        return NextResponse.json(
          { success: false, error: 'date, startTime, endTime は必須です' },
          { status: 400 }
        );
      }
      if (!ot.hours || typeof ot.hours !== 'number') {
        return NextResponse.json(
          { success: false, error: 'hours は必須です（数値）' },
          { status: 400 }
        );
      }
    }

    // プレレビュー実行
    const result = await runPreReview(
      applicationType as ApplicationType,
      application
    );

    return NextResponse.json({
      success: true,
      result: {
        ...result,
        checkedAt: result.checkedAt.toISOString(),
        aiReview: result.aiReview
          ? {
              ...result.aiReview,
              reviewedAt: result.aiReview.reviewedAt.toISOString(),
            }
          : undefined,
      },
    });
  } catch (error) {
    console.error('[PreReview] レビューエラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'レビューに失敗しました',
      },
      { status: 500 }
    );
  }
}
