/**
 * 研修セッション詳細API
 *
 * GET /api/training/sessions/[id] - 詳細取得
 * PATCH /api/training/sessions/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getSession, updateSession } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const session = getSession(id);

    if (!session) {
      return NextResponse.json(
        { error: '研修セッションが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('training session GET error:', error);
    return NextResponse.json(
      { error: '研修セッションの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
        { error: '研修セッションを更新する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = updateSession(id, body, currentUser.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({ session: result.session });
  } catch (error) {
    console.error('training session PATCH error:', error);
    return NextResponse.json(
      { error: '研修セッションの更新に失敗しました' },
      { status: 500 }
    );
  }
}
