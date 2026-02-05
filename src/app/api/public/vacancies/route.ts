/**
 * 公開空室情報API
 *
 * Ticket 070: 空室 外部提示システム
 * Ticket 076: キャッシュ戦略（revalidateTag対応）
 * Ticket 080: 表示最適化（並び順・検索・フィルタ）
 *
 * GET /api/public/vacancies - 公開空室一覧（認証不要）
 *
 * クエリパラメータ:
 * - businessUnitId: 事業単位ID
 * - area: エリア（部分一致）
 * - roomType: 部屋タイプ
 * - sort: 並び順（availability, date, price）
 * - minAvailableCount: 最小空室数
 * - priceMax: 最大月額料金（万円）
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
 * Ticket 080: ソートオプション
 */
type SortOption = 'availability' | 'date' | 'price' | 'name';

/**
 * Ticket 080: フィルタオプション
 */
interface FilterOptions {
  businessUnitId?: string;
  area?: string;
  roomType?: string;
  minAvailableCount?: number;
  priceMax?: number;
}

/**
 * Ticket 080: ソート関数
 */
function sortVacancies(items: PublicVacancyUnit[], sort: SortOption): PublicVacancyUnit[] {
  return [...items].sort((a, b) => {
    switch (sort) {
      case 'availability':
        // 空室数が多い順 → 入居可能日が近い順 → 名前順
        if (b.availableCount !== a.availableCount) {
          return b.availableCount - a.availableCount;
        }
        const dateA = a.availableFrom ? new Date(a.availableFrom).getTime() : 0;
        const dateB = b.availableFrom ? new Date(b.availableFrom).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return a.buildingName.localeCompare(b.buildingName, 'ja');

      case 'date':
        // 入居可能日が近い順（即入居可が最優先）
        const now = Date.now();
        const getDateScore = (d: string | null) => {
          if (!d) return 0;
          const t = new Date(d).getTime();
          return t <= now ? 0 : t;
        };
        const scoreA = getDateScore(a.availableFrom);
        const scoreB = getDateScore(b.availableFrom);
        if (scoreA !== scoreB) return scoreA - scoreB;
        return b.availableCount - a.availableCount;

      case 'price':
        // 価格が安い順（nullは最後）
        const priceA = a.priceRangeJson?.monthlyMin ?? Infinity;
        const priceB = b.priceRangeJson?.monthlyMin ?? Infinity;
        if (priceA !== priceB) return priceA - priceB;
        return b.availableCount - a.availableCount;

      case 'name':
      default:
        return a.buildingName.localeCompare(b.buildingName, 'ja');
    }
  });
}

/**
 * Ticket 080: フィルタ関数（追加フィルタをアプリ側で適用）
 */
function filterVacancies(items: PublicVacancyUnit[], options: FilterOptions): PublicVacancyUnit[] {
  let result = items;

  // area部分一致
  if (options.area) {
    const areaLower = options.area.toLowerCase();
    result = result.filter(u => u.area.toLowerCase().includes(areaLower));
  }

  // roomType完全一致
  if (options.roomType) {
    result = result.filter(u => u.roomType === options.roomType);
  }

  // 最小空室数
  if (options.minAvailableCount !== undefined && options.minAvailableCount > 0) {
    result = result.filter(u => u.availableCount >= options.minAvailableCount!);
  }

  // 最大価格
  if (options.priceMax !== undefined) {
    result = result.filter(u => {
      const minPrice = u.priceRangeJson?.monthlyMin;
      if (minPrice == null) return true; // 価格未設定は含める
      return minPrice <= options.priceMax!;
    });
  }

  return result;
}

/**
 * キャッシュ付きで空室一覧を取得
 *
 * - 60秒のTTL（revalidate: 60）
 * - tags: ['vacancies', 'vacancies:${businessUnitId}'] で即時無効化可能
 */
function getCachedPublicVacancies(
  businessUnitId?: string
): Promise<PublicVacancyUnit[]> {
  // タグを決定
  const tags = [VACANCY_TAG];
  if (businessUnitId) {
    tags.push(getVacancyTagForBusinessUnit(businessUnitId));
  }

  // キャッシュキーを生成（businessUnitIdのみでキャッシュ、他のフィルタはアプリ側で適用）
  const cacheKey = `public-vacancies:${businessUnitId || 'all'}`;

  // unstable_cache でラップ
  const cachedFn = unstable_cache(
    async () => {
      // シードデータ初期化
      seedVacancyUnitsIfEmpty();
      return listPublicVacancyUnits({ businessUnitId });
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

    // Ticket 080: クエリパラメータ取得
    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;
    const area = searchParams.get('area') ?? undefined;
    const roomType = searchParams.get('roomType') ?? undefined;
    const sort = (searchParams.get('sort') as SortOption) || 'availability';
    const minAvailableCount = searchParams.get('minAvailableCount')
      ? parseInt(searchParams.get('minAvailableCount')!, 10)
      : undefined;
    const priceMax = searchParams.get('priceMax')
      ? parseInt(searchParams.get('priceMax')!, 10)
      : undefined;

    // キャッシュ付きで取得（businessUnitIdのみでキャッシュ）
    let items = await getCachedPublicVacancies(businessUnitId);

    // Ticket 080: 追加フィルタをアプリ側で適用
    items = filterVacancies(items, {
      area,
      roomType,
      minAvailableCount,
      priceMax,
    });

    // Ticket 080: ソート適用
    items = sortVacancies(items, sort);

    // メタデータ収集（フィルタオプション用）
    const allItems = await getCachedPublicVacancies(businessUnitId);
    const areas = Array.from(new Set(allItems.map(u => u.area))).sort();
    const roomTypes = Array.from(new Set(allItems.map(u => u.roomType))).sort();

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
        // Ticket 080: フィルタ用メタデータ
        meta: {
          areas,
          roomTypes,
          totalBeforeFilter: allItems.length,
        },
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
