/**
 * 未収貸倒 API
 *
 * POST /api/receivables/[id]/writeoff
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, writeOff } from '@/lib/receivables/repo.firestore';
import { canWriteOff } from '@/lib/receivables/types';
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
    if (!canWriteOff(role)) {
      return NextResponse.json(
        { error: '貸倒処理権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const { note } = body as { note?: string };

    const existing = await getById(id, viewer);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const receivable = await writeOff(id, note ?? null, user.uid);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error writing off:', error);
    return NextResponse.json(
      { error: '貸倒処理に失敗しました' },
      { status: 500 }
    );
  }
}
