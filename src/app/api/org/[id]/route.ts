/**
 * 組織単位詳細・更新 API
 * GET   /api/org/{id} - 詳細取得
 * PATCH /api/org/{id} - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import * as repo from '@/lib/org/repo';
import type { ViewerContext, UpdateOrgUnitInput } from '@/lib/org/types';
import { canViewOrgTree, canEditOrg } from '@/lib/org/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const unit = repo.getOrgUnitById(id);

    if (!unit) {
      return NextResponse.json(
        { success: false, error: '組織が見つかりません' },
        { status: 404 }
      );
    }

    // メンバーと責任者も取得
    const members = repo.listMembers(id);
    const managers = repo.listManagers(id);

    return NextResponse.json({ success: true, unit, members, managers });
  } catch (error) {
    console.error('Org Detail GET Error:', error);
    return NextResponse.json(
      { success: false, error: '組織の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    if (!canEditOrg(viewer.role)) {
      return NextResponse.json(
        { success: false, error: '組織を更新する権限がありません' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as UpdateOrgUnitInput;
    const result = repo.updateOrgUnit(id, body, viewer.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, unit: result.unit });
  } catch (error) {
    console.error('Org Update PATCH Error:', error);
    return NextResponse.json(
      { success: false, error: '組織の更新に失敗しました' },
      { status: 500 }
    );
  }
}
