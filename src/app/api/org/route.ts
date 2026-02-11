/**
 * 組織単位一覧・作成 API
 * GET  /api/org - 一覧取得
 * POST /api/org - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import * as repo from '@/lib/org/repo.firestore';
import type { ViewerContext, CreateOrgUnitInput } from '@/lib/org/types';
import { canViewOrgTree, canEditOrg } from '@/lib/org/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    if (!canViewOrgTree(viewer.role)) {
      return NextResponse.json(
        { success: false, error: '組織を閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const units = await repo.listOrgUnits({ includeInactive });

    return NextResponse.json({ success: true, units });
  } catch (error) {
    console.error('Org List GET Error:', error);
    return NextResponse.json(
      { success: false, error: '組織一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    if (!canEditOrg(viewer.role)) {
      return NextResponse.json(
        { success: false, error: '組織を作成する権限がありません' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CreateOrgUnitInput;

    if (!body.name || !body.type) {
      return NextResponse.json(
        { success: false, error: '名前と種別は必須です' },
        { status: 400 }
      );
    }

    const result = await repo.createOrgUnit(body, viewer.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, unit: result.unit }, { status: 201 });
  } catch (error) {
    console.error('Org Create POST Error:', error);
    return NextResponse.json(
      { success: false, error: '組織の作成に失敗しました' },
      { status: 500 }
    );
  }
}
