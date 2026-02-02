/**
 * 未読件数API
 *
 * GET /api/announcements/unread-count
 * 自分の未読周知事項件数を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAnnouncementsForUser } from '@/lib/announcements/store';
import { countUnread, initializeDemoReadReceipts } from '@/lib/readTracking/repo';
import type { AppRole } from '@/config/appRoles';

// デモ用初期化フラグ
let demoInitialized = false;

export async function GET(request: NextRequest) {
  // デモデータ初期化
  if (!demoInitialized) {
    initializeDemoReadReceipts();
    demoInitialized = true;
  }

  // 暫定：ユーザー情報はヘッダーから取得（本番では認証から）
  const userId = request.headers.get('x-user-id') ?? 'user_001';
  const userRole = (request.headers.get('x-user-role') ?? 'staff') as AppRole;
  const userBranchId = request.headers.get('x-user-branch-id') ?? undefined;

  // 自分対象の公開済み周知を取得
  const { announcements } = listAnnouncementsForUser(userRole, userId, userBranchId, {
    limit: 1000, // 全件取得
  });

  const announcementIds = announcements.map((a) => a.id);
  const unreadCount = countUnread(userId, 'announcement', announcementIds);

  return NextResponse.json({
    unreadCount,
    totalCount: announcements.length,
  });
}
