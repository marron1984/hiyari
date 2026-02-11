/**
 * Scope Backfill Events API
 *
 * GET /api/admin/scope-backfill/events
 * Implementation Ticket 032: 監査ログ一覧取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { listBackfillEvents } from '@/lib/admin/backfill/repo';
import { canAccessBackfill } from '@/lib/admin/backfill/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // 権限チェック
    if (!canAccessBackfill(user.role)) {
      return NextResponse.json(
        { success: false, error: 'この操作にはadmin権限が必要です' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const events = listBackfillEvents(limit);

    return NextResponse.json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('scope-backfill events error:', error);
    return NextResponse.json(
      { success: false, error: '監査ログの取得に失敗しました' },
      { status: 500 }
    );
  }
}
