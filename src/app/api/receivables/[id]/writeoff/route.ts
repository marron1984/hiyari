/**
 * 未収貸倒 API
 *
 * POST /api/receivables/[id]/writeoff
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getById, writeOff } from '@/lib/receivables/repo';
import { canWriteOff } from '@/lib/receivables/types';
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
    if (!canWriteOff(currentUser.role)) {
      return NextResponse.json(
        { error: '貸倒処理権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const { note } = body as { note?: string };

    const existing = getById(id, currentUser);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const receivable = writeOff(id, note ?? null, currentUser.id);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error writing off:', error);
    return NextResponse.json(
      { error: '貸倒処理に失敗しました' },
      { status: 500 }
    );
  }
}
