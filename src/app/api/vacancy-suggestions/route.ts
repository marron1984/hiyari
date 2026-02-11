/**
 * 空室更新提案API
 *
 * Ticket 075: 空室情報の自動更新支援
 *
 * GET /api/vacancy-suggestions - 提案一覧
 *
 * RBAC: admin/manager/staff が閲覧可能
 */

import { NextRequest, NextResponse } from 'next/server';
import { listSuggestions, getSuggestionStats } from '@/lib/vacancySuggestions/repo';
import { canViewSuggestions } from '@/lib/vacancySuggestions/types';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canViewSuggestions(viewer)) {
      return NextResponse.json(
        { error: '提案を閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;
    const status = searchParams.get('status') as 'open' | 'applied' | 'dismissed' | undefined;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const { items, total } = listSuggestions({
      businessUnitId,
      status,
      limit,
      offset,
    });

    const stats = getSuggestionStats(businessUnitId);

    return NextResponse.json({
      items,
      total,
      stats,
    });
  } catch (error) {
    console.error('vacancy-suggestions GET error:', error);
    return NextResponse.json(
      { error: '提案の取得に失敗しました' },
      { status: 500 }
    );
  }
}
