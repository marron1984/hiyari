/**
 * 申し送り既読統計API（manager以上のみ）
 *
 * GET /api/handover/[id]/read-stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { getHandoverItem, getHandoverReadStats } from '@/lib/handover/repo';
import { getHandoverTargetUserIds, getAllUsers } from '@/lib/handover/getHandoverTargetUserIds';
import { listUnreadUserIds } from '@/lib/readTracking/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // 権限チェック: manager以上のみ
    if (!['admin', 'executive', 'manager'].includes(user.role)) {
      return NextResponse.json(
        { error: '既読統計を閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const item = getHandoverItem(id);

    if (!item) {
      return NextResponse.json(
        { error: '申し送りが見つかりません' },
        { status: 404 }
      );
    }

    const stats = getHandoverReadStats(id);
    if (!stats) {
      return NextResponse.json(
        { error: '統計の取得に失敗しました' },
        { status: 500 }
      );
    }

    // 未読ユーザー一覧（上位50件）
    const targetUserIds = getHandoverTargetUserIds(item);
    const unreadUserIds = listUnreadUserIds('handover', id, targetUserIds);
    const allUsers = getAllUsers();

    const unreadUsers = unreadUserIds
      .slice(0, 50)
      .map((userId) => {
        const user = allUsers.find((u) => u.id === userId);
        return { id: userId, name: user?.name ?? userId };
      });

    return NextResponse.json({
      itemId: id,
      targetCount: stats.targetCount,
      readCount: stats.readCount,
      unreadCount: stats.unreadCount,
      readRate: stats.readRate,
      unreadUsers,
    });
  } catch (error) {
    console.error('handover read-stats GET error:', error);
    return NextResponse.json(
      { error: '既読統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
