/**
 * 紹介元管理API
 *
 * Ticket 073: 紹介元refトラッキング
 *
 * GET /api/ref-sources - 一覧取得
 * POST /api/ref-sources - 新規作成
 *
 * RBAC: admin/manager のみ
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listRefSources,
  createRefSource,
  seedRefSourcesIfEmpty,
} from '@/lib/refSources/repo';
import {
  canManageRefSources,
  canViewRefSources,
  type RefSourceType,
  type RefSourceStatus,
} from '@/lib/refSources/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    // シードデータ
    seedRefSourcesIfEmpty();

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    if (!canViewRefSources(viewer)) {
      return NextResponse.json(
        { error: '紹介元を閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as RefSourceStatus | null;
    const type = searchParams.get('type') as RefSourceType | null;
    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;
    const q = searchParams.get('q') ?? undefined;
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!, 10)
      : 50;
    const offset = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!, 10)
      : 0;

    const { items, total } = listRefSources({
      status: status ?? undefined,
      type: type ?? undefined,
      businessUnitId,
      q,
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
    console.error('ref-sources GET error:', error);
    return NextResponse.json(
      { error: '紹介元の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    if (!canManageRefSources(viewer)) {
      return NextResponse.json(
        { error: '紹介元を作成する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { ref, name, type, allowedBusinessUnitIds, note } = body;

    // バリデーション
    if (!name) {
      return NextResponse.json(
        { error: '紹介元名は必須です' },
        { status: 400 }
      );
    }

    if (!type || !['hospital', 'care_manager', 'agency', 'other'].includes(type)) {
      return NextResponse.json(
        { error: 'タイプは hospital, care_manager, agency, other のいずれかを指定してください' },
        { status: 400 }
      );
    }

    // refコードのバリデーション（指定された場合）
    if (ref) {
      if (!/^[A-Z0-9]{4,12}$/.test(ref)) {
        return NextResponse.json(
          { error: 'refコードは4〜12文字の英大文字・数字で指定してください' },
          { status: 400 }
        );
      }
    }

    const source = createRefSource(
      {
        ref,
        name,
        type,
        allowedBusinessUnitIds,
        note,
      },
      DEMO_USER.id
    );

    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error('ref-sources POST error:', error);

    // 重複エラー
    if (error instanceof Error && error.message.includes('既に使用')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: '紹介元の作成に失敗しました' },
      { status: 500 }
    );
  }
}
