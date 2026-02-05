/**
 * 公開空室情報API
 *
 * Ticket 070: 空室 外部提示システム
 *
 * GET /api/vacancies - 公開空室一覧（認証不要）
 *
 * - status=active のみ
 * - 個人情報なし
 * - vacancy_view_logs に閲覧ログ記録
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listPublicAsync,
  logPublicViewAsync,
  seedIfEmptyAsync,
} from '@/lib/vacancyUnits/repo';

export async function GET(request: NextRequest) {
  try {
    // シードデータ初期化
    await seedIfEmptyAsync();

    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;

    // 公開用一覧取得（status=active, availableCount > 0）
    const items = await listPublicAsync({ businessUnitId });

    // 閲覧ログ記録（失敗しても主処理は落とさない）
    const forwardedFor = request.headers.get('x-forwarded-for');
    const userAgent = request.headers.get('user-agent');
    const referer = request.headers.get('referer');

    // クエリパラメータをオブジェクトに変換
    const queryJson: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      queryJson[key] = value;
    });

    await logPublicViewAsync({
      businessUnitId,
      ip: forwardedFor?.split(',')[0]?.trim(),
      userAgent: userAgent ?? undefined,
      referer: referer ?? undefined,
      path: '/api/vacancies',
      query: queryJson,
    }).catch(err => {
      console.error('Failed to log public view:', err);
    });

    return NextResponse.json({
      items,
      totalCount: items.length,
    });
  } catch (error) {
    console.error('vacancies GET error:', error);
    return NextResponse.json(
      { error: '空室情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
