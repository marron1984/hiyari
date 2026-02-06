/**
 * 内部空室管理API（個別）
 *
 * Ticket 070: 空室 外部提示システム
 *
 * GET /api/admin/vacancies/[id] - 詳細取得
 * PATCH /api/admin/vacancies/[id] - 更新
 * DELETE /api/admin/vacancies/[id] - 削除
 *
 * RBAC: admin/manager のみ
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getByIdAsync,
  updateAsync,
  removeAsync,
} from '@/lib/vacancyUnits/repo';
import {
  canViewVacancyUnits,
  canEditVacancyUnits,
  canManageVacancyUnits,
} from '@/lib/vacancyUnits/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    if (!canViewVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const unit = await getByIdAsync(id);
    if (!unit) {
      return NextResponse.json(
        { error: '空室ユニットが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ unit });
  } catch (error) {
    console.error('admin/vacancies GET error:', error);
    return NextResponse.json(
      { error: '空室ユニットの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    if (!canEditVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '空室ユニットを編集する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const {
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

    // バリデーション
    if (capacity !== undefined && (typeof capacity !== 'number' || capacity < 0)) {
      return NextResponse.json(
        { error: '定員は0以上の数値で指定してください' },
        { status: 400 }
      );
    }

    if (availableCount !== undefined && (typeof availableCount !== 'number' || availableCount < 0)) {
      return NextResponse.json(
        { error: '空室数は0以上の数値で指定してください' },
        { status: 400 }
      );
    }

    const unit = await updateAsync(
      id,
      {
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

    if (!unit) {
      return NextResponse.json(
        { error: '空室ユニットが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ unit });
  } catch (error) {
    console.error('admin/vacancies PATCH error:', error);
    return NextResponse.json(
      { error: '空室ユニットの更新に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    if (!canManageVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '空室ユニットを削除する権限がありません' },
        { status: 403 }
      );
    }

    const deleted = await removeAsync(id);
    if (!deleted) {
      return NextResponse.json(
        { error: '空室ユニットが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('admin/vacancies DELETE error:', error);
    return NextResponse.json(
      { error: '空室ユニットの削除に失敗しました' },
      { status: 500 }
    );
  }
}
