// ======== 決裁前レビュー完了 API ========

import { NextRequest, NextResponse } from 'next/server';
import { completePreReview } from '@/lib/pre-review';
import type {
  ApplicationType,
  ExpenseApplication,
  OvertimeApplication,
  ReviewFlag,
} from '@/types/pre-review';

/**
 * POST /api/pre-review/complete
 * レビュー確認完了を記録
 *
 * Request Body:
 * - applicationType: 'expense' | 'overtime' (必須)
 * - application: ExpenseApplication | OvertimeApplication (必須)
 * - flags: ReviewFlag[] (必須)
 * - outcome: 'submitted' | 'modified' | 'cancelled' (必須)
 * - modificationsMade: string[] (任意)
 * - tenantId: string (default: 'default')
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      applicationType,
      application,
      flags,
      outcome,
      modificationsMade,
      tenantId = 'default',
    } = body;

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

    if (!Array.isArray(flags)) {
      return NextResponse.json(
        { success: false, error: 'flags は配列で指定してください' },
        { status: 400 }
      );
    }

    if (!outcome || !['submitted', 'modified', 'cancelled'].includes(outcome)) {
      return NextResponse.json(
        { success: false, error: 'outcome は submitted, modified, cancelled のいずれかを指定してください' },
        { status: 400 }
      );
    }

    // ログ保存
    const logId = await completePreReview(
      applicationType as ApplicationType,
      application as ExpenseApplication | OvertimeApplication,
      flags as ReviewFlag[],
      outcome,
      tenantId,
      modificationsMade
    );

    return NextResponse.json({
      success: true,
      logId,
      message: outcome === 'submitted'
        ? '申請が送信されました'
        : outcome === 'modified'
        ? '修正後に申請が送信されました'
        : '申請がキャンセルされました',
    });
  } catch (error) {
    console.error('[PreReview] 完了記録エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '記録に失敗しました',
      },
      { status: 500 }
    );
  }
}
