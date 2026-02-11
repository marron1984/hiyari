/**
 * 未収ステータス変更 API
 *
 * POST /api/receivables/[id]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, changeStatus } from '@/lib/receivables/repo';
import { canEditReceivables } from '@/lib/receivables/types';
import type { ReceivableStatus, UserRole as ReceivablesRole } from '@/lib/receivables/types';
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

    const { status } = body as { status: ReceivableStatus };

    if (!status) {
      return NextResponse.json(
        { error: 'status は必須です' },
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

    const receivable = changeStatus(id, status, user.uid);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error changing status:', error);
    return NextResponse.json(
      { error: 'ステータス変更に失敗しました' },
      { status: 500 }
    );
  }
}
