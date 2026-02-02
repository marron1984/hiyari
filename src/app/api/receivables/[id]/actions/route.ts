/**
 * 未収アクションログ API
 *
 * GET /api/receivables/[id]/actions - アクション一覧
 * POST /api/receivables/[id]/actions - アクション追加
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, getActions, addAction } from '@/lib/receivables/repo';
import { canViewReceivables, canEditReceivables } from '@/lib/receivables/types';
import type { ViewerContext, ReceivableActionType, ReceivableActionOutcome } from '@/lib/receivables/types';

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
    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const existing = getById(id, DEMO_VIEWER);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const { actions, total } = getActions(id, limit, offset);

    return NextResponse.json({ actions, total });
  } catch (error) {
    console.error('Error fetching actions:', error);
    return NextResponse.json(
      { error: 'アクションログの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
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
      actionType,
      occurredAt,
      summary,
      detail,
      outcome,
      promisedAt,
      amountPaid,
      nextActionAt,
    } = body as {
      actionType: ReceivableActionType;
      occurredAt?: string;
      summary: string;
      detail?: string;
      outcome?: ReceivableActionOutcome;
      promisedAt?: string;
      amountPaid?: number;
      nextActionAt?: string;
    };

    if (!actionType || !summary) {
      return NextResponse.json(
        { error: 'actionType, summary は必須です' },
        { status: 400 }
      );
    }

    const existing = getById(id, DEMO_VIEWER);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const action = addAction(
      id,
      {
        actionType,
        occurredAt,
        summary,
        detail,
        outcome,
        promisedAt,
        amountPaid,
        nextActionAt,
      },
      DEMO_VIEWER.userId
    );

    if (!action) {
      return NextResponse.json(
        { error: 'アクション追加に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    console.error('Error adding action:', error);
    return NextResponse.json(
      { error: 'アクション追加に失敗しました' },
      { status: 500 }
    );
  }
}
