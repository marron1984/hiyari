/**
 * 組織移動 API
 * POST /api/org/{id}/move - 組織を移動
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
        { success: false, error: '組織を移動する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const newParentId = body.newParentId ?? null;

    const result = await repo.moveOrgUnit(id, newParentId, viewer.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, unit: result.unit });
  } catch (error) {
    console.error('Org Move POST Error:', error);
    return NextResponse.json(
      { success: false, error: '組織の移動に失敗しました' },
      { status: 500 }
    );
  }
}
