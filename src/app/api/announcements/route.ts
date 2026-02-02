/**
 * 周知事項API
 *
 * GET /api/announcements - 周知一覧取得
 * POST /api/announcements - 周知作成（管理者のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listAnnouncementsForUser,
  listAnnouncements,
  createAnnouncement,
} from '@/lib/announcements/store';
import { listReadIds, initializeDemoReadReceipts } from '@/lib/readTracking/repo';
import { checkRole } from '@/lib/auth/requireRole';
import type { AppRole } from '@/config/appRoles';
import type { AnnouncementListItem, AnnouncementFilter, CreateAnnouncementRequest } from '@/lib/announcements/types';

// デモ用：初回リクエスト時に既読データを初期化
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

  const { searchParams } = new URL(request.url);
  const onlyUnread = searchParams.get('onlyUnread') === 'true';
  const search = searchParams.get('search') ?? undefined;
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  // 管理者は全件、それ以外は自分対象のみ
  const isManager = await checkRole(['admin', 'executive', 'manager']);
  const showAll = searchParams.get('all') === 'true' && isManager;

  const filter: AnnouncementFilter = { search, limit, offset };

  const { announcements, total } = showAll
    ? listAnnouncements(filter)
    : listAnnouncementsForUser(userRole, userId, userBranchId, filter);

  // 既読情報を付与
  const announcementIds = announcements.map((a) => a.id);
  const readIds = listReadIds(userId, 'announcement', announcementIds);

  let items: AnnouncementListItem[] = announcements.map((a) => ({
    ...a,
    isRead: readIds.has(a.id),
  }));

  // 未読のみフィルタ
  if (onlyUnread) {
    items = items.filter((a) => !a.isRead);
  }

  // 未読件数
  const unreadCount = items.filter((a) => !a.isRead).length;

  return NextResponse.json({
    announcements: items,
    total: onlyUnread ? items.length : total,
    unreadCount,
  });
}

export async function POST(request: NextRequest) {
  // 管理者権限チェック
  const isManager = await checkRole(['admin', 'executive', 'manager']);
  if (!isManager) {
    return NextResponse.json(
      { error: 'アクセス権限がありません' },
      { status: 403 }
    );
  }

  // 暫定：作成者情報
  const authorId = request.headers.get('x-user-id') ?? 'user_001';
  const authorName = request.headers.get('x-user-name') ?? 'システム管理者';

  // ボディ解析
  let body: CreateAnnouncementRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが不正です' },
      { status: 400 }
    );
  }

  // バリデーション
  if (!body.title || !body.content) {
    return NextResponse.json(
      { error: 'タイトルと内容は必須です' },
      { status: 400 }
    );
  }

  if (!body.targetRoles || body.targetRoles.length === 0) {
    return NextResponse.json(
      { error: '対象ロールを指定してください' },
      { status: 400 }
    );
  }

  // 作成
  const announcement = createAnnouncement(body, authorId, authorName);

  return NextResponse.json({
    success: true,
    announcement,
  });
}
