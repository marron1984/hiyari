/**
 * 周知事項詳細API
 *
 * GET /api/announcements/[id] - 周知詳細取得（自動既読化）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAnnouncementById } from '@/lib/announcements/store';
import { markRead, isRead as checkIsRead, initializeDemoReadReceipts } from '@/lib/readTracking/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

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

  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  const { id } = await params;

  // 周知を取得
  const announcement = getAnnouncementById(id);
  if (!announcement) {
    return NextResponse.json(
      { error: '周知事項が見つかりません' },
      { status: 404 }
    );
  }

  // 公開済みでなければ403（管理者チェックは省略）
  if (announcement.status !== 'published') {
    return NextResponse.json(
      { error: 'この周知事項は公開されていません' },
      { status: 403 }
    );
  }

  // 既読をマーク（開いたら既読）
  const wasUnread = !checkIsRead(user.uid, 'announcement', id);
  markRead(user.uid, 'announcement', id);

  return NextResponse.json({
    announcement: {
      ...announcement,
      isRead: true,
    },
    wasUnread, // 今回初めて読んだかどうか
  });
}
