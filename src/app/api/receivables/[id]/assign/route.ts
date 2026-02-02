/**
 * 未収担当割当 API
 *
 * POST /api/receivables/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, assignOwner } from '@/lib/receivables/repo';
import { canAssignOwner } from '@/lib/receivables/types';
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
    if (!canAssignOwner(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '割当権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const { ownerUserId } = body as { ownerUserId: string | null };

    const existing = getById(id, DEMO_VIEWER);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const receivable = assignOwner(id, ownerUserId, DEMO_VIEWER.userId);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error assigning owner:', error);
    return NextResponse.json(
      { error: '担当割当に失敗しました' },
      { status: 500 }
    );
  }
}
