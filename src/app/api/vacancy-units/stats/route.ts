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
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(_request: NextRequest) {
  try {
    seedVacancyUnitsIfEmpty();

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
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
