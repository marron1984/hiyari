/**
 * 未収ステータス変更 API
 *
 * POST /api/receivables/[id]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getById, changeStatus } from '@/lib/receivables/repo';
import { canEditReceivables } from '@/lib/receivables/types';
import type { ViewerContext, ReceivableStatus } from '@/lib/receivables/types';

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
    if (!canEditReceivables(currentUser.role)) {
      return NextResponse.json(
        { error: '編集権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const { status } = body as { status: ReceivableStatus };

    if (!status) {
      return NextResponse.json(
        { error: 'status は必須です' },
        { status: 400 }
      );
    }

    const existing = getById(id, currentUser);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const receivable = changeStatus(id, status, currentUser.id);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error changing status:', error);
    return NextResponse.json(
      { error: 'ステータス変更に失敗しました' },
      { status: 500 }
    );
  }
}
