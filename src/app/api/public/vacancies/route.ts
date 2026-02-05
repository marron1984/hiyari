/**
 * 公開空室情報API
 *
 * Ticket 070: 空室 外部提示システム
 * Ticket 076: キャッシュ戦略（revalidateTag対応）
 *
 * GET /api/public/vacancies - 公開空室一覧（認証不要）
 *
 * 個人情報なし、active のみ
 *
 * キャッシュ戦略:
 * - unstable_cache で60秒TTL + tags
 * - 空室更新時に revalidateTag('vacancies') で即時無効化
 */

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import {
  listPublicVacancyUnits,
  addViewLog,
  seedVacancyUnitsIfEmpty,
} from '@/lib/vacancyUnits/repo';
import { VACANCY_TAG, getVacancyTagForBusinessUnit } from '@/lib/cache/vacancyTags';
import type { PublicVacancyUnit } from '@/lib/vacancyUnits/types';

/**
 * キャッシュ付きで空室一覧を取得
 *
 * - 60秒のTTL（revalidate: 60）
 * - tags: ['vacancies', 'vacancies:${businessUnitId}'] で即時無効化可能
 */
function getCachedPublicVacancies(
  businessUnitId?: string,
  area?: string
): Promise<PublicVacancyUnit[]> {
  // タグを決定
  const tags = [VACANCY_TAG];
  if (businessUnitId) {
    tags.push(getVacancyTagForBusinessUnit(businessUnitId));
  }

  // キャッシュキーを生成
  const cacheKey = `public-vacancies:${businessUnitId || 'all'}:${area || 'all'}`;

  // unstable_cache でラップ
  const cachedFn = unstable_cache(
    async () => {
      // シードデータ初期化
      seedVacancyUnitsIfEmpty();
      return listPublicVacancyUnits({ businessUnitId, area });
    },
    [cacheKey],
    {
      revalidate: 60, // 60秒TTL
      tags,
    }
  );

  return cachedFn();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;
    const area = searchParams.get('area') ?? undefined;

    // キャッシュ付きで取得
    const items = await getCachedPublicVacancies(businessUnitId, area);

    // 閲覧ログ記録（キャッシュ外で実行、失敗しても主処理に影響なし）
    const forwardedFor = request.headers.get('x-forwarded-for');
    const userAgent = request.headers.get('user-agent');
    try {
      addViewLog({
        viewerType: 'public',
        ipAddress: forwardedFor?.split(',')[0]?.trim(),
        userAgent: userAgent ?? undefined,
      });
    } catch (logError) {
      console.error('Failed to log view:', logError);
    }

    // Cache-Control ヘッダーも設定（CDN/ブラウザ用）
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
    console.error('public vacancies GET error:', error);
    return NextResponse.json(
      { error: '空室情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
