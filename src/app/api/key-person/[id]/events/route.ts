/**
 * キーパーソン監査ログ API
 *
 * GET /api/key-person/[id]/events
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuditTrail } from '@/lib/keyPerson/repo';
import { canViewAuditLog } from '@/lib/keyPerson/types';
import type { ViewerContext } from '@/lib/keyPerson/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 権限チェック
    if (!canViewAuditLog(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '監査ログ閲覧権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { events, total } = getAuditTrail(id, limit, offset);

    return NextResponse.json({ events, total });
  } catch (error) {
    console.error('Error fetching key person events:', error);
    return NextResponse.json(
      { error: '監査ログの取得に失敗しました' },
      { status: 500 }
    );
  }
}
