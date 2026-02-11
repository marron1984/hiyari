/**
 * 未分類チケット一覧API
 *
 * GET /api/admin/unclassified/tickets
 * Implementation Ticket 034: 未分類を現場で即解消できるUI
 */

import { NextRequest, NextResponse } from 'next/server';
import { listUnclassifiedTickets } from '@/lib/admin/unclassified/repo';
import { canAccessUnclassified } from '@/lib/admin/unclassified/types';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  // 権限チェック
  if (!canAccessUnclassified(user.role as AppRole)) {
    return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q') ?? undefined;
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const result = listUnclassifiedTickets({
      q,
      limit: limitParam ? parseInt(limitParam, 10) : 100,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    });

    return NextResponse.json({
      success: true,
      items: result.items,
      totalCount: result.totalCount,
    });
  } catch (error) {
    console.error('unclassified tickets GET error:', error);
    return NextResponse.json(
      { error: '未分類チケットの取得に失敗しました' },
      { status: 500 }
    );
  }
}
