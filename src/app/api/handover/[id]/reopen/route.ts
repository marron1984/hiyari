/**
 * 申し送り再オープンAPI
 *
 * POST /api/handover/[id]/reopen
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { reopenHandoverItem } from '@/lib/handover/repo';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;

    const result = reopenHandoverItem(id, currentUser.id, currentUser.role);

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
