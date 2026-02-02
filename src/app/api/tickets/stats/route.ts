/**
 * チケット統計API
 *
 * GET /api/tickets/stats
 */

import { NextResponse } from 'next/server';
import { getTicketStats } from '@/lib/tickets/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET() {
  try {
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    const stats = getTicketStats(viewer);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('tickets stats GET error:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
