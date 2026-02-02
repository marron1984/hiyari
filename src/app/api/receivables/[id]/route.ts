/**
 * 未収詳細 API
 *
 * GET /api/receivables/[id] - 詳細取得
 * PATCH /api/receivables/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, updateReceivable } from '@/lib/receivables/repo';
import { canViewReceivables, canEditReceivables } from '@/lib/receivables/types';
import type { ViewerContext } from '@/lib/receivables/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 権限チェック
    if (!canViewReceivables(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '閲覧権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const receivable = getById(id, DEMO_VIEWER);

    if (!receivable) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error fetching receivable:', error);
    return NextResponse.json(
      { error: '未収の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 権限チェック
    if (!canEditReceivables(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '編集権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const {
      subjectName,
      invoiceNo,
      period,
      description,
      amount,
      dueAt,
      issuedAt,
      priority,
      riskNote,
      nextActionAt,
      nextActionType,
    } = body;

    const receivable = updateReceivable(
      id,
      {
        subjectName,
        invoiceNo,
        period,
        description,
        amount,
        dueAt,
        issuedAt,
        priority,
        riskNote,
        nextActionAt,
        nextActionType,
      },
      DEMO_VIEWER.userId
    );

    if (!receivable) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error updating receivable:', error);
    return NextResponse.json(
      { error: '未収の更新に失敗しました' },
      { status: 500 }
    );
  }
}
