/**
 * 研修対象者割当API
 *
 * POST /api/training/sessions/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { assignUsers } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };

    if (!canManageTraining(viewer)) {
      return NextResponse.json(
        { error: '対象者を割り当てる権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userIds, dueAt } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'ユーザーIDは必須です' },
        { status: 400 }
      );
    }

    const result = assignUsers(
      sessionId,
      userIds,
      dueAt ?? null,
      DEMO_USER.id
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // TODO: 通知センターへ割当通知を送信

    return NextResponse.json({ assignedCount: result.count }, { status: 201 });
  } catch (error) {
    console.error('training assign POST error:', error);
    return NextResponse.json(
      { error: '対象者の割当に失敗しました' },
      { status: 500 }
    );
  }
}
