/**
 * 未読件数API
 *
 * GET /api/announcements/unread-count
 * 自分の未読周知事項件数を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAnnouncementsForUser } from '@/lib/announcements/store';
import { countUnread, initializeDemoReadReceipts } from '@/lib/readTracking/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

// デモ用初期化フラグ
let demoInitialized = false;

export async function GET(request: NextRequest) {
  // デモデータ初期化
  if (!demoInitialized) {
    initializeDemoReadReceipts();
    demoInitialized = true;
  }

  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  const userRole = user.role as AppRole;

  // 自分対象の公開済み周知を取得
  const { announcements } = listAnnouncementsForUser(userRole, user.uid, user.baseId, {
    limit: 1000, // 全件取得
  });

  const announcementIds = announcements.map((a) => a.id);
  const unreadCount = countUnread(user.uid, 'announcement', announcementIds);

  return NextResponse.json({
    unreadCount,
    totalCount: announcements.length,
  });
}
