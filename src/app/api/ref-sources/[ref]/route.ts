/**
 * 紹介元個別API
 *
 * Ticket 073: 紹介元refトラッキング
 *
 * GET /api/ref-sources/[ref] - 詳細取得
 * PUT /api/ref-sources/[ref] - 更新
 * DELETE /api/ref-sources/[ref] - 削除（無効化推奨）
 *
 * RBAC: admin/manager のみ
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getRefSourceByRef,
  updateRefSource,
  deleteRefSource,
  getRefAccessLogs,
} from '@/lib/refSources/repo.firestore';
import {
  canManageRefSources,
  canViewRefSources,
  type RefSourceType,
  type RefSourceStatus,
} from '@/lib/refSources/types';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

interface RouteParams {
  params: Promise<{ ref: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { ref } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canViewRefSources(viewer)) {
      return NextResponse.json(
        { error: '紹介元を閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const source = await getRefSourceByRef(ref);
    if (!source) {
      return NextResponse.json(
        { error: '紹介元が見つかりません' },
        { status: 404 }
      );
    }

    // アクセスログも取得
    const accessLogs = await getRefAccessLogs(ref, 20);

    return NextResponse.json({
      source,
      accessLogs,
    });
  } catch (error) {
    console.error('ref-sources/[ref] GET error:', error);
    return NextResponse.json(
      { error: '紹介元の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { ref } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canManageRefSources(viewer)) {
      return NextResponse.json(
        { error: '紹介元を更新する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, type, status, allowedBusinessUnitIds, note } = body;

    // typeバリデーション
    if (type && !['hospital', 'care_manager', 'agency', 'other'].includes(type)) {
      return NextResponse.json(
        { error: 'タイプは hospital, care_manager, agency, other のいずれかを指定してください' },
        { status: 400 }
      );
    }

    // statusバリデーション
    if (status && !['active', 'disabled'].includes(status)) {
      return NextResponse.json(
        { error: 'ステータスは active, disabled のいずれかを指定してください' },
        { status: 400 }
      );
    }

    const source = await updateRefSource(ref, {
      name,
      type: type as RefSourceType | undefined,
      status: status as RefSourceStatus | undefined,
      allowedBusinessUnitIds,
      note,
    });

    if (!source) {
      return NextResponse.json(
        { error: '紹介元が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ source });
  } catch (error) {
    console.error('ref-sources/[ref] PUT error:', error);
    return NextResponse.json(
      { error: '紹介元の更新に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { ref } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canManageRefSources(viewer)) {
      return NextResponse.json(
        { error: '紹介元を削除する権限がありません' },
        { status: 403 }
      );
    }

    const deleted = await deleteRefSource(ref);
    if (!deleted) {
      return NextResponse.json(
        { error: '紹介元が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ref-sources/[ref] DELETE error:', error);
    return NextResponse.json(
      { error: '紹介元の削除に失敗しました' },
      { status: 500 }
    );
  }
}
