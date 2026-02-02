/**
 * 周知事項詳細API
 *
 * GET /api/announcements/[id] - 周知詳細取得（自動既読化）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAnnouncementById } from '@/lib/announcements/store';
import { markRead, isRead as checkIsRead, initializeDemoReadReceipts } from '@/lib/readTracking/repo';

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

  const { id } = await params;

  // 暫定：ユーザーIDはヘッダーから取得（本番では認証から）
  const userId = request.headers.get('x-user-id') ?? 'user_001';

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
  const wasUnread = !checkIsRead(userId, 'announcement', id);
  markRead(userId, 'announcement', id);

  return NextResponse.json({
    announcement: {
      ...announcement,
      isRead: true,
    },
    wasUnread, // 今回初めて読んだかどうか
  });
}
