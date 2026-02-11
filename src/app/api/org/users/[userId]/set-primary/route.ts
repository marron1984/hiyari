/**
 * プライマリ所属設定 API
 * POST /api/org/users/{userId}/set-primary - プライマリ所属を設定
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import * as repo from '@/lib/org/repo';
import type { ViewerContext } from '@/lib/org/types';
import { canEditMembership } from '@/lib/org/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: targetUserId } = await params;
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    if (!canEditMembership(viewer.role)) {
      return NextResponse.json(
        { success: false, error: 'プライマリ所属を設定する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const orgUnitId = body.orgUnitId;

    if (!orgUnitId) {
      return NextResponse.json(
        { success: false, error: '組織IDは必須です' },
        { status: 400 }
      );
    }

    const result = repo.setPrimaryMembership(targetUserId, orgUnitId, viewer.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // 更新後のコンテキストを返す
    const context = repo.getUserOrgContext(targetUserId);

    return NextResponse.json({ success: true, context });
  } catch (error) {
    console.error('Set Primary POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'プライマリ所属の設定に失敗しました' },
      { status: 500 }
    );
  }
}
