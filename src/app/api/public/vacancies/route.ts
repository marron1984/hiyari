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
import { listPublic as listPublicFirestore } from '@/lib/vacancyUnits/repo.firestore';

export async function GET(request: NextRequest) {
  try {
    // シードデータ初期化
    seedVacancyUnitsIfEmpty();

    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;
    const area = searchParams.get('area') ?? undefined;

    // In-memory結果
    const memoryItems = listPublicVacancyUnits({ businessUnitId, area });

    // Firestoreからマージ（永続化された空室を含む）
    let items = memoryItems;
    try {
      const fsItems = await listPublicFirestore({ businessUnitId, area });
      if (fsItems.length > 0) {
        const memoryIds = new Set(memoryItems.map((u) => u.id));
        const newFromFs = fsItems.filter((u) => !memoryIds.has(u.id));
        items = [...memoryItems, ...newFromFs];
      }
    } catch {
      // Firestore接続失敗時はIn-memoryのみ
    }

    // 閲覧ログ記録
    const forwardedFor = request.headers.get('x-forwarded-for');
    const userAgent = request.headers.get('user-agent');
    addViewLog({
      viewerType: 'public',
      ipAddress: forwardedFor?.split(',')[0]?.trim(),
      userAgent: userAgent ?? undefined,
    });

    const response = NextResponse.json({
      items,
      totalCount: items.length,
    });

    // MVP: 60秒キャッシュ（CDN/ブラウザ両方）
    response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

    return response;
  } catch (error) {
    console.error('public vacancies GET error:', error);
    return NextResponse.json(
      { error: '空室情報の取得に失敗しました', items: [], totalCount: 0 },
      { status: 500 }
    );
  }
}
