/**
 * 未収管理 API
 *
 * GET /api/receivables - 一覧取得
 * POST /api/receivables - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { listReceivables, createReceivable } from '@/lib/receivables/repo';
import {
  canViewReceivables,
  canCreateReceivables,
} from '@/lib/receivables/types';
import type { ViewerContext, ReceivableStatus, ReceivablePriority } from '@/lib/receivables/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET(request: NextRequest) {
  try {
    // 権限チェック
    if (!canViewReceivables(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '閲覧権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const filters = {
      status: searchParams.get('status') as ReceivableStatus | undefined,
      priority: searchParams.get('priority') as ReceivablePriority | undefined,
      overdue: searchParams.get('overdue') === 'true' ? true : undefined,
      agingMinDays: searchParams.get('agingMinDays')
        ? parseInt(searchParams.get('agingMinDays')!, 10)
        : undefined,
      amountMin: searchParams.get('amountMin')
        ? parseInt(searchParams.get('amountMin')!, 10)
        : undefined,
      ownerUserId: searchParams.get('ownerUserId') || undefined,
      q: searchParams.get('q') || undefined,
    };

    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { items, total } = listReceivables(DEMO_VIEWER, filters, { limit, offset });

    return NextResponse.json({ items, total });
  } catch (error) {
    console.error('Error fetching receivables:', error);
    return NextResponse.json(
      { error: '未収一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 権限チェック
    if (!canCreateReceivables(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '作成権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const {
      subjectType,
      subjectId,
      subjectName,
      invoiceNo,
      period,
      description,
      amount,
      dueAt,
      issuedAt,
      priority,
      ownerUserId,
      nextActionAt,
      nextActionType,
    } = body;

    if (!subjectType || !subjectName || !amount || !dueAt) {
      return NextResponse.json(
        { error: 'subjectType, subjectName, amount, dueAt は必須です' },
        { status: 400 }
      );
    }

    const receivable = createReceivable(
      {
        subjectType,
        subjectId,
        subjectName,
        invoiceNo,
        period,
        description,
        amount,
        dueAt,
        issuedAt,
        priority,
        ownerUserId,
        nextActionAt,
        nextActionType,
      },
      DEMO_VIEWER.userId
    );

    return NextResponse.json({ receivable }, { status: 201 });
  } catch (error) {
    console.error('Error creating receivable:', error);
    return NextResponse.json(
      { error: '未収の作成に失敗しました' },
      { status: 500 }
    );
  }
}
