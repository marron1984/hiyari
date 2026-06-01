/**
 * 回収フロー割当 API
 *
 * POST /api/collection/assign - フロー割当
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { assignFlow } from '@/lib/collection/repo';
import { canAssignFlow } from '@/lib/collection/types';
import type { ViewerContext } from '@/lib/collection/types';
export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!canAssignFlow(currentUser.role)) {
      return NextResponse.json(
        { error: '割当権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { receivableId, templateId, baseDate } = body;

    if (!receivableId || !templateId) {
      return NextResponse.json(
        { error: 'receivableId, templateId は必須です' },
        { status: 400 }
      );
    }

    const assignment = assignFlow(
      receivableId,
      templateId,
      currentUser.id,
      baseDate
    );

    if (!assignment) {
      return NextResponse.json(
        { error: 'フローの割当に失敗しました。テンプレートが無効か、ステップがありません。' },
        { status: 400 }
      );
    }

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    console.error('Error assigning flow:', error);
    return NextResponse.json(
      { error: 'フローの割当に失敗しました' },
      { status: 500 }
    );
  }
}
