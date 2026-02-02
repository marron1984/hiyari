/**
 * 回収フローステップ詳細 API
 *
 * PATCH /api/collection/steps/[stepId] - ステップ更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStepById, updateStep } from '@/lib/collection/repo';
import { canManageTemplates } from '@/lib/collection/types';
import type { ViewerContext } from '@/lib/collection/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  try {
    if (!canManageTemplates(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '編集権限がありません' },
        { status: 403 }
      );
    }

    const { stepId } = await params;
    const existing = getStepById(stepId);

    if (!existing) {
      return NextResponse.json(
        { error: 'ステップが見つかりません' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { actionType, dueDaysAfterPrevious, messageTemplate, expectedOutcome, severity, isActive } = body;

    const step = updateStep(
      stepId,
      { actionType, dueDaysAfterPrevious, messageTemplate, expectedOutcome, severity, isActive },
      DEMO_VIEWER.userId
    );

    if (!step) {
      return NextResponse.json(
        { error: 'ステップの更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ step });
  } catch (error) {
    console.error('Error updating step:', error);
    return NextResponse.json(
      { error: 'ステップの更新に失敗しました' },
      { status: 500 }
    );
  }
}
