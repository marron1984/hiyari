/**
 * 公開空室情報API
 *
 * Ticket 070: 空室 外部提示システム
 *
 * GET /api/public/vacancies - 公開空室一覧（認証不要）
 *
 * 個人情報なし、active のみ
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listPublicVacancyUnits,
  addViewLog,
  seedVacancyUnitsIfEmpty,
} from '@/lib/vacancyUnits/repo';

export async function GET(request: NextRequest) {
  try {
    // シードデータ初期化
    seedVacancyUnitsIfEmpty();

    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;
    const area = searchParams.get('area') ?? undefined;

    const items = listPublicVacancyUnits({ businessUnitId, area });

    // 閲覧ログ記録
    const forwardedFor = request.headers.get('x-forwarded-for');
    const userAgent = request.headers.get('user-agent');
    addViewLog({
      viewerType: 'public',
      ipAddress: forwardedFor?.split(',')[0]?.trim(),
      userAgent: userAgent ?? undefined,
    });

    return NextResponse.json({
      items,
      totalCount: items.length,
    });
  } catch (error) {
    console.error('public vacancies GET error:', error);
    return NextResponse.json(
      { error: '空室情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
