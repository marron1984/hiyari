/**
 * 回収フローステップ実行 API
 *
 * POST /api/collection/receivable/[receivableId]/steps/[stepOrder]/complete - ステップ完了
 */

import { NextRequest, NextResponse } from 'next/server';
import { completeStep, skipStep } from '@/lib/collection/repo';
import { canExecuteStep } from '@/lib/collection/types';
import type { ViewerContext, StepOutcome } from '@/lib/collection/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ receivableId: string; stepOrder: string }> }
) {
  try {
    if (!canExecuteStep(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '実行権限がありません' },
        { status: 403 }
      );
    }

    const { receivableId, stepOrder: stepOrderStr } = await params;
    const stepOrder = parseInt(stepOrderStr, 10);

    if (isNaN(stepOrder)) {
      return NextResponse.json(
        { error: 'stepOrder が不正です' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, outcome, note } = body;

    if (action === 'skip') {
      const stepLog = skipStep(receivableId, stepOrder, DEMO_VIEWER.userId, note);
      if (!stepLog) {
        return NextResponse.json(
          { error: 'スキップに失敗しました。ステップが見つからないか、既に完了しています。' },
          { status: 400 }
        );
      }
      return NextResponse.json({ stepLog });
    }

    // デフォルトは complete
    const stepLog = completeStep(
      receivableId,
      stepOrder,
      DEMO_VIEWER.userId,
      outcome as StepOutcome,
      note
    );

    if (!stepLog) {
      return NextResponse.json(
        { error: 'ステップ完了に失敗しました。ステップが見つからないか、既に完了しています。' },
        { status: 400 }
      );
    }

    return NextResponse.json({ stepLog });
  } catch (error) {
    console.error('Error completing step:', error);
    return NextResponse.json(
      { error: 'ステップ完了に失敗しました' },
      { status: 500 }
    );
  }
}
