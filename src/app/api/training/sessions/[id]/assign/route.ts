/**
 * 研修対象者割当API
 *
 * POST /api/training/sessions/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { assignUsers, getSession } from '@/lib/training/repo.firestore';
import { canManageTraining } from '@/lib/training/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id: sessionId } = await params;
    const viewer = { userId: user.uid, role: user.role as AppRole };

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

    const result = await assignUsers(
      sessionId,
      userIds,
      dueAt ?? null,
      user.uid
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // 割当通知を送信（失敗しても本体処理には影響させない）
    try {
      const today = new Date().toISOString().split('T')[0];
      const session = await getSession(sessionId);
      const sessionTitle = session?.name ?? '研修セッション';
      for (const targetUserId of userIds) {
        await createNotificationAsync({
          tenantId: 'default',
          userId: targetUserId,
          type: 'system',
          severity: 'info',
          title: '研修が割当されました',
          message: `研修「${sessionTitle}」が割当されました`,
          url: '/dashboard/training',
          fingerprint: `training_assign:${sessionId}:${today}:${targetUserId}`,
        });
      }
    } catch (error) {
      console.error('Failed to send training assign notification:', error);
    }

    return NextResponse.json({ assignedCount: result.count }, { status: 201 });
  } catch (error) {
    console.error('training assign POST error:', error);
    return NextResponse.json(
      { error: '対象者の割当に失敗しました' },
      { status: 500 }
    );
  }
}
