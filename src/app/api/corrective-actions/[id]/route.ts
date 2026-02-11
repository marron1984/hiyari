/**
 * GET /api/corrective-actions/[id]  - 詳細取得
 * PATCH /api/corrective-actions/[id] - ステータス変更
 *
 * Ticket 131: 詳細API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, changeStatus } from '@/lib/correctiveActions/repo.firestore';
import type { CorrectiveActionStatus } from '@/lib/correctiveActions/types';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  try {
    const { id } = await params;
    const viewer = { userId: user.uid, role: user.role as AppRole };
    const result = await getById(id, viewer);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ item: result.item });
  } catch (error) {
    console.error('corrective-actions [id] GET error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'status は必須です' }, { status: 400 });
    }

    const viewer = { userId: user.uid, role: user.role as AppRole };
    const result = await changeStatus(id, status as CorrectiveActionStatus, viewer);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, item: result.item });
  } catch (error) {
    console.error('corrective-actions [id] PATCH error:', error);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
