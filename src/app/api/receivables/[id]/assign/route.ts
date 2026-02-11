/**
 * 未収担当割当 API
 *
 * POST /api/receivables/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, assignOwner } from '@/lib/receivables/repo.firestore';
import { canAssignOwner } from '@/lib/receivables/types';
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
    if (!canAssignOwner(role)) {
      return NextResponse.json(
        { error: '割当権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const { ownerUserId } = body as { ownerUserId: string | null };

    const existing = await getById(id, viewer);
    if (!existing) {
      return NextResponse.json(
        { error: '未収が見つかりません' },
        { status: 404 }
      );
    }

    const receivable = await assignOwner(id, ownerUserId, user.uid);

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error('Error assigning owner:', error);
    return NextResponse.json(
      { error: '担当割当に失敗しました' },
      { status: 500 }
    );
  }
}
