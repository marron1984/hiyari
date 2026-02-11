/**
 * 空室ユニット統計API
 *
 * Ticket 070: 空室 外部提示システム
 *
 * GET /api/vacancy-units/stats - 統計取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVacancyUnitStats, seedVacancyUnitsIfEmpty } from '@/lib/vacancyUnits/repo';
import { canViewVacancyUnits } from '@/lib/vacancyUnits/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    seedVacancyUnitsIfEmpty();

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canViewVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const stats = getVacancyUnitStats();

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('vacancy-units stats GET error:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
