/**
 * 未収貸倒 API
 *
 * POST /api/receivables/[id]/writeoff
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, writeOff } from '@/lib/receivables/repo';
import { canWriteOff } from '@/lib/receivables/types';
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
    if (!canWriteOff(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '貸倒処理権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const { note } = body as { note?: string };

    const existing = getById(id, DEMO_VIEWER);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const receivable = writeOff(id, note ?? null, DEMO_VIEWER.userId);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error writing off:', error);
    return NextResponse.json(
      { error: '貸倒処理に失敗しました' },
      { status: 500 }
    );
  }
}
