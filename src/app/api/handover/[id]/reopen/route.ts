/**
 * 申し送り再オープンAPI
 *
 * POST /api/handover/[id]/reopen
 */

import { NextRequest, NextResponse } from 'next/server';
import { reopenHandoverItem } from '@/lib/handover/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;

    const result = reopenHandoverItem(id, user.uid, user.role as AppRole);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === '申し送りが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ item: result.item });
  } catch (error) {
    console.error('handover reopen POST error:', error);
    return NextResponse.json(
      { error: '再オープンに失敗しました' },
      { status: 500 }
    );
  }
}
