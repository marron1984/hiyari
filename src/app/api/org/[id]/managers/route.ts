/**
 * 組織責任者管理 API
 * GET  /api/org/{id}/managers - 責任者一覧
 * POST /api/org/{id}/managers - 責任者追加/削除
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/org/repo';
import type { ViewerContext, OrgManagerType } from '@/lib/org/types';
import { canViewOrgTree, canEditOrg } from '@/lib/org/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const viewer: ViewerContext = {
      userId: 'user_admin',
      role: 'admin',
    };

    if (!canViewOrgTree(viewer.role)) {
      return NextResponse.json(
        { success: false, error: '責任者を閲覧する権限がありません' },
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

    const managers = repo.listManagers(id);

    return NextResponse.json({ success: true, managers });
  } catch (error) {
    console.error('Org Managers GET Error:', error);
    return NextResponse.json(
      { success: false, error: '責任者一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const viewer: ViewerContext = {
      userId: 'user_admin',
      role: 'admin',
    };

    if (!canEditOrg(viewer.role)) {
      return NextResponse.json(
        { success: false, error: '責任者を編集する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = body.action as 'add' | 'remove';
    const userId = body.userId;
    const type = body.type as OrgManagerType;

    if (!userId || !type) {
      return NextResponse.json(
        { success: false, error: 'ユーザーIDと種別は必須です' },
        { status: 400 }
      );
    }

    let result;
    if (action === 'remove') {
      result = repo.removeOrgManager(id, userId, type, viewer.userId);
    } else {
      result = repo.setOrgManager(id, userId, type, viewer.userId);
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // 更新後の責任者一覧を返す
    const managers = repo.listManagers(id);

    return NextResponse.json({ success: true, managers });
  } catch (error) {
    console.error('Org Managers POST Error:', error);
    return NextResponse.json(
      { success: false, error: '責任者の編集に失敗しました' },
      { status: 500 }
    );
  }
}
