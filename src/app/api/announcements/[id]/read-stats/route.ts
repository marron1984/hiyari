/**
 * 既読統計API（管理者向け）
 *
 * GET /api/announcements/[id]/read-stats
 * 周知事項の既読率・未読者を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAnnouncementById } from '@/lib/announcements/store';
import { getAnnouncementTargetUserIds } from '@/lib/announcements/getAnnouncementTargetUserIds';
import {
  getReadStats,
  listUnreadUserIds,
  initializeDemoReadReceipts,
} from '@/lib/readTracking/repo';
import { checkRole } from '@/lib/auth/requireRole';
import { getUserById } from '@/lib/roles/user-store';
import type { UnreadUser } from '@/lib/readTracking/types';

// デモ用初期化フラグ
let demoInitialized = false;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // デモデータ初期化
  if (!demoInitialized) {
    initializeDemoReadReceipts();
    demoInitialized = true;
  }

  // manager以上のみ
  const isManager = await checkRole(['admin', 'executive', 'manager']);
  if (!isManager) {
    return NextResponse.json(
      { error: 'アクセス権限がありません（管理職以上のみ）' },
      { status: 403 }
    );
  }

  const { id } = await params;

  // 周知を取得
  const announcement = getAnnouncementById(id);
  if (!announcement) {
    return NextResponse.json(
      { error: '周知事項が見つかりません' },
      { status: 404 }
    );
  }

  // 対象ユーザーを取得
  const targetUserIds = getAnnouncementTargetUserIds(announcement);

  // 既読統計を取得
  const stats = getReadStats('announcement', id, targetUserIds);

  // 未読ユーザーを取得（上位50件）
  const { searchParams } = new URL(request.url);
  const unreadLimit = parseInt(searchParams.get('unreadLimit') ?? '50', 10);

  const unreadUserIds = listUnreadUserIds('announcement', id, targetUserIds);
  const limitedUnreadUserIds = unreadUserIds.slice(0, unreadLimit);

  const unreadUsers: UnreadUser[] = [];
  for (const userId of limitedUnreadUserIds) {
    const user = getUserById(userId);
    if (user) {
      unreadUsers.push({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    }
  }

  return NextResponse.json({
    ...stats,
    unreadUsers,
    hasMoreUnread: unreadUserIds.length > unreadLimit,
  });
}
