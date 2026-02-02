/**
 * 組織移動 API
 * POST /api/org/{id}/move - 組織を移動
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/org/repo';
import type { ViewerContext } from '@/lib/org/types';
import { canEditOrg } from '@/lib/org/types';

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
        { success: false, error: '組織を移動する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const newParentId = body.newParentId ?? null;

    const result = repo.moveOrgUnit(id, newParentId, viewer.userId);

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
