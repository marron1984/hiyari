/**
 * 研修セッションステータス変更API
 *
 * POST /api/training/sessions/[id]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { setSessionStatus } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';
import type { SessionStatus } from '@/lib/training/types';

const VALID_STATUSES: SessionStatus[] = ['planned', 'done', 'cancelled'];

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
    const viewer = { userId: currentUser.id, role: currentUser.role };

    if (!canManageTraining(viewer)) {
      return NextResponse.json(
        { error: 'ステータスを変更する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: '有効なステータスを指定してください' },
        { status: 400 }
      );
    }

    const result = setSessionStatus(id, status, currentUser.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({ session: result.session });
  } catch (error) {
    console.error('training session status POST error:', error);
    return NextResponse.json(
      { error: 'ステータスの変更に失敗しました' },
      { status: 500 }
    );
  }
}
