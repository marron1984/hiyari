/**
 * 未収完済 API
 *
 * POST /api/receivables/[id]/paid
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, markPaid } from '@/lib/receivables/repo';
import { canEditReceivables } from '@/lib/receivables/types';
import type { ViewerContext } from '@/lib/receivables/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

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

    const { paidAt } = body as { paidAt: string };

    if (!paidAt) {
      return NextResponse.json(
        { error: 'paidAt は必須です' },
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

    const receivable = markPaid(id, paidAt, DEMO_VIEWER.userId);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error marking paid:', error);
    return NextResponse.json(
      { error: '完済処理に失敗しました' },
      { status: 500 }
    );
  }
}
