/**
 * ロール変更履歴API
 *
 * GET /api/admin/roles/events
 * クエリ: limit, targetUserId
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRoleChangeEvents } from '@/lib/roles/user-store.firestore';
import { requireAdmin } from '@/lib/auth/requireRole';

export async function GET(request: NextRequest) {
  // 管理者権限チェック
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: 'アクセス権限がありません' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const targetUserId = searchParams.get('targetUserId') ?? undefined;

  const events = await getRoleChangeEvents({
    limit,
    targetUserId,
  });

  return NextResponse.json({
    events,
    total: events.length,
  });
}
