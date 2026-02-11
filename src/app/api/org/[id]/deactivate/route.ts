/**
 * 組織無効化 API
 * POST /api/org/{id}/deactivate - 組織を無効化
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import * as repo from '@/lib/org/repo.firestore';
import type { ViewerContext } from '@/lib/org/types';
import { canEditOrg } from '@/lib/org/types';

export async function POST(
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
        { success: false, error: '組織を無効化する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action ?? 'deactivate';

    let result;
    if (action === 'reactivate') {
      result = await repo.reactivateOrgUnit(id, viewer.userId);
    } else {
      result = await repo.deactivateOrgUnit(id, viewer.userId);
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // 更新後の組織を返す
    const unit = await repo.getOrgUnitById(id);

    return NextResponse.json({ success: true, unit });
  } catch (error) {
    console.error('Org Deactivate POST Error:', error);
    return NextResponse.json(
      { success: false, error: '組織の無効化に失敗しました' },
      { status: 500 }
    );
  }
}
