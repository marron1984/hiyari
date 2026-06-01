/**
 * 空室ユニット統計API
 *
 * Ticket 070: 空室 外部提示システム
 *
 * GET /api/vacancy-units/stats - 統計取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getVacancyUnitStats, seedVacancyUnitsIfEmpty } from '@/lib/vacancyUnits/repo';
import { canViewVacancyUnits } from '@/lib/vacancyUnits/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    seedVacancyUnitsIfEmpty();

    const viewer = { userId: currentUser.id, role: currentUser.role };
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
