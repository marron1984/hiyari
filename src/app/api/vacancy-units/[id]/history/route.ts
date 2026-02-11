/**
 * 空室ユニット更新履歴API
 *
 * Ticket 070: 空室 外部提示システム
 * Ticket 075: 現場最速化
 *
 * GET /api/vacancy-units/[id]/history - 更新履歴取得（直近20件）
 */

import { NextRequest, NextResponse } from 'next/server';
import { listVacancyUpdates, getVacancyUnitById } from '@/lib/vacancyUnits/repo';
import { canViewVacancyUnits } from '@/lib/vacancyUnits/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canViewVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    // ユニット存在確認
    const unit = getVacancyUnitById(id);
    if (!unit) {
      return NextResponse.json(
        { error: '空室ユニットが見つかりません' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!, 10)
      : 50;

    const updates = listVacancyUpdates(id, limit);

    return NextResponse.json({ updates });
  } catch (error) {
    console.error('vacancy-units history GET error:', error);
    return NextResponse.json(
      { error: '更新履歴の取得に失敗しました' },
      { status: 500 }
    );
  }
}
