/**
 * 公開空室情報API
 *
 * Ticket 070: 空室 外部提示システム
 * Ticket 076: キャッシュ戦略（revalidateTag対応）
 *
 * GET /api/vacancies - 公開空室一覧（認証不要）
 *
 * - status=active のみ
 * - 個人情報なし
 * - vacancy_view_logs に閲覧ログ記録
 *
 * キャッシュ戦略:
 * - unstable_cache で60秒TTL + tags
 * - 空室更新時に revalidateTag('vacancies') で即時無効化
 */

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import {
  listPublicAsync,
  logPublicViewAsync,
  seedIfEmptyAsync,
} from '@/lib/vacancyUnits/repo';
import { VACANCY_TAG, getVacancyTagForBusinessUnit } from '@/lib/cache/vacancyTags';
import type { PublicVacancyUnit } from '@/lib/vacancyUnits/types';

/**
 * キャッシュ付きで空室一覧を取得
 */
function getCachedPublicVacancies(
  businessUnitId?: string
): Promise<PublicVacancyUnit[]> {
  const tags = [VACANCY_TAG];
  if (businessUnitId) {
    tags.push(getVacancyTagForBusinessUnit(businessUnitId));
  }

  const cacheKey = `vacancies:${businessUnitId || 'all'}`;

  const cachedFn = unstable_cache(
    async () => {
      await seedIfEmptyAsync();
      return listPublicAsync({ businessUnitId });
    },
    [cacheKey],
    {
      revalidate: 60,
      tags,
    }
  );

  return cachedFn();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;

    // キャッシュ付きで取得
    const items = await getCachedPublicVacancies(businessUnitId);

    // 閲覧ログ記録（キャッシュ外で実行）
    const forwardedFor = request.headers.get('x-forwarded-for');
    const userAgent = request.headers.get('user-agent');
    const referer = request.headers.get('referer');

    const queryJson: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      queryJson[key] = value;
    });

    logPublicViewAsync({
      businessUnitId,
      ip: forwardedFor?.split(',')[0]?.trim(),
      userAgent: userAgent ?? undefined,
      referer: referer ?? undefined,
      path: '/api/vacancies',
      query: queryJson,
    }).catch(err => {
      console.error('Failed to log public view:', err);
    });

    return NextResponse.json(
      {
        items,
        totalCount: items.length,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('vacancies GET error:', error);
    return NextResponse.json(
      { error: '空室情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
