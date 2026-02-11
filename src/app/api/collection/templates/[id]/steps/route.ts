/**
 * 回収フローステップ API
 *
 * POST /api/collection/templates/[id]/steps - ステップ追加
 */

import { NextRequest, NextResponse } from 'next/server';
import { createStep, getTemplateById, reorderSteps } from '@/lib/collection/repo';
import { canManageTemplates } from '@/lib/collection/types';
import type { CollectionActionType, ExpectedOutcome, StepSeverity } from '@/lib/collection/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canManageTemplates(user.role as any)) {
      return NextResponse.json(
        { error: '作成権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const template = getTemplateById(id);

    if (!template) {
      return NextResponse.json(
        { error: 'テンプレートが見つかりません' },
        { status: 404 }
      );
    }

    const body = await request.json();

    // reorder の場合
    if (body.orderedStepIds) {
      const success = reorderSteps(id, body.orderedStepIds, user.uid);
      if (success) {
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json(
          { error: '並び替えに失敗しました' },
          { status: 400 }
        );
      }
    }

    // ステップ追加
    const { actionType, dueDaysAfterPrevious, messageTemplate, expectedOutcome, severity } = body;

    if (!actionType || dueDaysAfterPrevious === undefined) {
      return NextResponse.json(
        { error: 'actionType, dueDaysAfterPrevious は必須です' },
        { status: 400 }
      );
    }

    const step = createStep(
      id,
      {
        actionType: actionType as CollectionActionType,
        dueDaysAfterPrevious,
        messageTemplate,
        expectedOutcome: expectedOutcome as ExpectedOutcome,
        severity: severity as StepSeverity,
      },
      user.uid
    );

    return NextResponse.json({ step }, { status: 201 });
  } catch (error) {
    console.error('Error creating step:', error);
    return NextResponse.json(
      { error: 'ステップの作成に失敗しました' },
      { status: 500 }
    );
  }
}
