/**
 * 回収フローステップ詳細 API
 *
 * PATCH /api/collection/steps/[stepId] - ステップ更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getStepById, updateStep } from '@/lib/collection/repo';
import { canManageTemplates } from '@/lib/collection/types';
import type { ViewerContext } from '@/lib/collection/types';
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!canManageTemplates(currentUser.role)) {
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
      currentUser.id
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
