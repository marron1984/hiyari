/**
 * 空室ユニット管理API
 *
 * Ticket 070: 空室 外部提示システム
 * Ticket 076: キャッシュ戦略（作成時にrevalidate）
 *
 * GET /api/vacancy-units - 一覧取得
 * POST /api/vacancy-units - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import {
  listVacancyUnits,
  createVacancyUnit,
  seedVacancyUnitsIfEmpty,
} from '@/lib/vacancyUnits/repo';
import { canViewVacancyUnits, canManageVacancyUnits } from '@/lib/vacancyUnits/types';
import { revalidateVacanciesForBusinessUnit } from '@/lib/cache/vacancyTags';
import type { VacancyUnitStatus } from '@/lib/vacancyUnits/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // シードデータ初期化
    seedVacancyUnitsIfEmpty();

    const viewer = { userId: currentUser.id, role: currentUser.role };
    if (!canViewVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;
    const status = searchParams.get('status') as VacancyUnitStatus | null;
    const area = searchParams.get('area') ?? undefined;
    const roomType = searchParams.get('roomType') ?? undefined; // Ticket 075
    const hasAvailability = searchParams.get('hasAvailability') === 'true';
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!, 10)
      : 100;
    const offset = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!, 10)
      : 0;

    const { items, total } = listVacancyUnits({
      businessUnitId,
      status: status ?? undefined,
      area,
      roomType, // Ticket 075
      hasAvailability: hasAvailability || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      items,
      totalCount: total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('vacancy-units GET error:', error);
    return NextResponse.json(
      { error: '空室ユニットの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const viewer = { userId: currentUser.id, role: currentUser.role };
    if (!canManageVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '空室ユニットを作成する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const {
      businessUnitId,
      buildingName,
      area,
      roomType,
      capacity,
      availableCount,
      availableFrom,
      conditionsJson,
      priceRangeJson,
      status,
    } = body;

    if (!businessUnitId || !buildingName || !area || !roomType) {
      return NextResponse.json(
        { error: '事業単位、建物名、エリア、部屋タイプは必須です' },
        { status: 400 }
      );
    }

    if (typeof capacity !== 'number' || capacity < 0) {
      return NextResponse.json(
        { error: '定員は0以上の数値で指定してください' },
        { status: 400 }
      );
    }

    if (typeof availableCount !== 'number' || availableCount < 0) {
      return NextResponse.json(
        { error: '空室数は0以上の数値で指定してください' },
        { status: 400 }
      );
    }

    const unit = createVacancyUnit(
      {
        businessUnitId,
        buildingName,
        area,
        roomType,
        capacity,
        availableCount,
        availableFrom,
        conditionsJson,
        priceRangeJson,
        status,
      },
      currentUser.id,
      currentUser.name
    );

    // Ticket 076: 公開キャッシュを無効化
    revalidateVacanciesForBusinessUnit(businessUnitId);

    return NextResponse.json({ unit }, { status: 201 });
  } catch (error) {
    console.error('vacancy-units POST error:', error);
    return NextResponse.json(
      { error: '空室ユニットの作成に失敗しました' },
      { status: 500 }
    );
  }
}
