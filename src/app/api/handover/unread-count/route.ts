/**
 * 申し送り未読件数API
 *
 * GET /api/handover/unread-count
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { countUnreadHandoverItems } from '@/lib/handover/repo';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const count = countUnreadHandoverItems(currentUser.role, currentUser.id);

    return NextResponse.json({ unreadCount: count });
  } catch (error) {
    console.error('handover unread-count GET error:', error);
    return NextResponse.json(
      { error: '未読件数の取得に失敗しました' },
      { status: 500 }
    );
  }
}
