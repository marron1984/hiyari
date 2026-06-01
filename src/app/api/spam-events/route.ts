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
import { authenticateRequest } from '@/lib/firebase-admin';
import { listSpamEvents, getSpamEventStats } from '@/lib/spam/repo';
import { canViewSpamEvents } from '@/lib/spam/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const viewer = { userId: currentUser.id, role: currentUser.role };
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
