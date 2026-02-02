/**
 * 申し送り未読件数API
 *
 * GET /api/handover/unread-count
 */

import { NextResponse } from 'next/server';
import { countUnreadHandoverItems } from '@/lib/handover/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET() {
  try {
    const count = countUnreadHandoverItems(DEMO_USER.role, DEMO_USER.id);

    return NextResponse.json({ unreadCount: count });
  } catch (error) {
    console.error('handover unread-count GET error:', error);
    return NextResponse.json(
      { error: '未読件数の取得に失敗しました' },
      { status: 500 }
    );
  }
}
