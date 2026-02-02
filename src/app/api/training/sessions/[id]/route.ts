/**
 * 研修セッション詳細API
 *
 * GET /api/training/sessions/[id] - 詳細取得
 * PATCH /api/training/sessions/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    const { id } = await params;
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };

    if (!canManageTraining(viewer)) {
      return NextResponse.json(
        { error: '研修セッションを更新する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = updateSession(id, body, DEMO_USER.id);

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
