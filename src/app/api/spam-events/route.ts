/**
 * スパムイベントAPI
 *
 * Ticket 077: 迷惑フィルタ（NGワード/連投/ブラックリスト）
 *
 * GET /api/spam-events - イベント一覧・統計
 *
 * RBAC: admin/manager のみ
 */

import { NextRequest, NextResponse } from 'next/server';
import { listSpamEvents, getSpamEventStats } from '@/lib/spam/repo';
import { canViewSpamEvents } from '@/lib/spam/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    if (!canViewSpamEvents(viewer)) {
      return NextResponse.json(
        { error: 'スパムイベントを閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    const events = listSpamEvents(limit);
    const stats = getSpamEventStats();

    return NextResponse.json({ events, stats });
  } catch (error) {
    console.error('spam-events GET error:', error);
    return NextResponse.json(
      { error: 'イベントの取得に失敗しました' },
      { status: 500 }
    );
  }
}
