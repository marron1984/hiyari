/**
 * 空室ユニット個別API
 *
 * Ticket 070: 空室 外部提示システム
 * Ticket 075: 現場最速化（RBAC強化 + PATCH対応）
 * Ticket 076: キャッシュ戦略（更新時にrevalidate）
 *
 * GET /api/vacancy-units/[id] - 詳細取得
 * PUT /api/vacancy-units/[id] - 全体更新
 * PATCH /api/vacancy-units/[id] - 部分更新（インライン編集用）
 * DELETE /api/vacancy-units/[id] - 削除
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getVacancyUnitById,
  updateVacancyUnit,
  deleteVacancyUnit,
} from '@/lib/vacancyUnits/repo';
import {
  canViewVacancyUnits,
  canEditVacancyUnits,
  canManageVacancyUnits,
} from '@/lib/vacancyUnits/types';
import { revalidateVacanciesForBusinessUnit } from '@/lib/cache/vacancyTags';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canViewVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const unit = getVacancyUnitById(id);
    if (!unit) {
      return NextResponse.json(
        { error: '空室ユニットが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ unit });
  } catch (error) {
    console.error('vacancy-units GET error:', error);
    return NextResponse.json(
      { error: '空室ユニットの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
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

    const unit = updateVacancyUnit(
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
      user.uid,
      user.name
    );

    if (!unit) {
      return NextResponse.json(
        { error: '空室ユニットが見つかりません' },
        { status: 404 }
      );
    }

    // Ticket 076: 公開キャッシュを無効化
    revalidateVacanciesForBusinessUnit(unit.businessUnitId);

    return NextResponse.json({ unit });
  } catch (error) {
    console.error('vacancy-units PUT error:', error);
    return NextResponse.json(
      { error: '空室ユニットの更新に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - 部分更新（Ticket 075: インライン編集用）
 *
 * インライン編集で1フィールドずつ更新する場合に使用
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canEditVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '空室ユニットを編集する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // PATCH では送られてきたフィールドのみ更新
    const allowedFields = [
      'availableCount',
      'availableFrom',
      'status',
      'buildingName',
      'area',
      'roomType',
      'capacity',
      'conditionsJson',
      'priceRangeJson',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // バリデーション
    if (updateData.capacity !== undefined && (typeof updateData.capacity !== 'number' || updateData.capacity < 0)) {
      return NextResponse.json(
        { error: '定員は0以上の数値で指定してください' },
        { status: 400 }
      );
    }

    if (updateData.availableCount !== undefined && (typeof updateData.availableCount !== 'number' || updateData.availableCount < 0)) {
      return NextResponse.json(
        { error: '空室数は0以上の数値で指定してください' },
        { status: 400 }
      );
    }

    if (updateData.status !== undefined && !['active', 'paused'].includes(updateData.status as string)) {
      return NextResponse.json(
        { error: 'ステータスは active または paused を指定してください' },
        { status: 400 }
      );
    }

    const unit = updateVacancyUnit(
      id,
      updateData,
      user.uid,
      user.name
    );

    if (!unit) {
      return NextResponse.json(
        { error: '空室ユニットが見つかりません' },
        { status: 404 }
      );
    }

    // Ticket 076: 公開キャッシュを無効化
    revalidateVacanciesForBusinessUnit(unit.businessUnitId);

    return NextResponse.json({ unit });
  } catch (error) {
    console.error('vacancy-units PATCH error:', error);
    return NextResponse.json(
      { error: '空室ユニットの更新に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canManageVacancyUnits(viewer)) {
      return NextResponse.json(
        { error: '空室ユニットを削除する権限がありません' },
        { status: 403 }
      );
    }

    // 削除前にbusinessUnitIdを取得（キャッシュ無効化用）
    const unit = getVacancyUnitById(id);
    const businessUnitId = unit?.businessUnitId;

    const deleted = deleteVacancyUnit(id);
    if (!deleted) {
      return NextResponse.json(
        { error: '空室ユニットが見つかりません' },
        { status: 404 }
      );
    }

    // Ticket 076: 公開キャッシュを無効化
    if (businessUnitId) {
      revalidateVacanciesForBusinessUnit(businessUnitId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('vacancy-units DELETE error:', error);
    return NextResponse.json(
      { error: '空室ユニットの削除に失敗しました' },
      { status: 500 }
    );
  }
}
