/**
 * 空室ユニット管理API
 *
 * Ticket 070: 空室 外部提示システム
 *
 * GET /api/vacancy-units - 一覧取得
 * POST /api/vacancy-units - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listVacancyUnits,
  createVacancyUnit,
  seedVacancyUnitsIfEmpty,
} from '@/lib/vacancyUnits/repo';
import {
  saveUnit as saveUnitFirestore,
  listAll as listAllFirestore,
} from '@/lib/vacancyUnits/repo.firestore';
import { canViewVacancyUnits, canManageVacancyUnits } from '@/lib/vacancyUnits/types';
import type { VacancyUnitStatus } from '@/lib/vacancyUnits/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    // シードデータ初期化
    seedVacancyUnitsIfEmpty();

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
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
    const hasAvailability = searchParams.get('hasAvailability') === 'true';
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!, 10)
      : 100;
    const offset = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!, 10)
      : 0;

    const filter = {
      businessUnitId,
      status: status ?? undefined,
      area,
      hasAvailability: hasAvailability || undefined,
      limit,
      offset,
    };

    // In-memory結果
    const { items: memoryItems, total: memoryTotal } = listVacancyUnits(filter);

    // Firestoreからマージ
    let items = memoryItems;
    let total = memoryTotal;
    try {
      const { items: fsItems } = await listAllFirestore(filter);
      if (fsItems.length > 0) {
        const memoryIds = new Set(memoryItems.map((u) => u.id));
        const newFromFs = fsItems.filter((u) => !memoryIds.has(u.id));
        items = [...memoryItems, ...newFromFs];
        total = memoryTotal + newFromFs.length;
      }
    } catch {
      // Firestore接続失敗時はIn-memoryのみ
    }

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
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
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
      DEMO_USER.id,
      DEMO_USER.name
    );

    // Firestore永続化
    try {
      await saveUnitFirestore(unit);
    } catch (e) {
      console.error('vacancy unit firestore save failed:', e);
    }

    return NextResponse.json({ unit }, { status: 201 });
  } catch (error) {
    console.error('vacancy-units POST error:', error);
    return NextResponse.json(
      { error: '空室ユニットの作成に失敗しました' },
      { status: 500 }
    );
  }
}
