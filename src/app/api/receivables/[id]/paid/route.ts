/**
 * 未収完済 API
 *
 * POST /api/receivables/[id]/paid
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, markPaid } from '@/lib/receivables/repo';
import { canEditReceivables } from '@/lib/receivables/types';
import type { UserRole as ReceivablesRole } from '@/lib/receivables/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const role = user.role as ReceivablesRole;
    const viewer = { userId: user.uid, role };

    // 権限チェック
    if (!canEditReceivables(role)) {
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

    const existing = getById(id, viewer);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const receivable = markPaid(id, paidAt, user.uid);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error marking paid:', error);
    return NextResponse.json(
      { error: '完済処理に失敗しました' },
      { status: 500 }
    );
  }
}
