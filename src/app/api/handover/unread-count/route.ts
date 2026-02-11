/**
 * 申し送り未読件数API
 *
 * GET /api/handover/unread-count
 */

import { NextRequest, NextResponse } from 'next/server';
import { countUnreadHandoverItems } from '@/lib/handover/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const count = countUnreadHandoverItems(user.role as AppRole, user.uid);

    return NextResponse.json({ unreadCount: count });
  } catch (error) {
    console.error('handover unread-count GET error:', error);
    return NextResponse.json(
      { error: '未読件数の取得に失敗しました' },
      { status: 500 }
    );
  }
}
