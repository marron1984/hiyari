/**
 * 未収担当割当 API
 *
 * POST /api/receivables/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getById, assignOwner } from '@/lib/receivables/repo';
import { canAssignOwner } from '@/lib/receivables/types';
import type { ViewerContext } from '@/lib/receivables/types';

// デモユーザー
const currentUser: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェック
    if (!canAssignOwner(currentUser.role)) {
      return NextResponse.json(
        { error: '割当権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const { ownerUserId } = body as { ownerUserId: string | null };

    const existing = getById(id, currentUser);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const receivable = assignOwner(id, ownerUserId, currentUser.id);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error assigning owner:', error);
    return NextResponse.json(
      { error: '担当割当に失敗しました' },
      { status: 500 }
    );
  }
}
