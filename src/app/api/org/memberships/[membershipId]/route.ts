/**
 * メンバーシップ更新・削除 API
 * PATCH /api/org/memberships/{membershipId} - 更新
 * POST  /api/org/memberships/{membershipId} - アクション（remove）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import * as repo from '@/lib/org/repo.firestore';
import type { ViewerContext, UpdateMembershipInput } from '@/lib/org/types';
import { canEditMembership } from '@/lib/org/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> }
) {
  try {
    const { membershipId } = await params;
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    if (!canEditMembership(viewer.role)) {
      return NextResponse.json(
        { success: false, error: '所属を更新する権限がありません' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as UpdateMembershipInput;
    const result = await repo.updateMembership(membershipId, body, viewer.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, membership: result.membership });
  } catch (error) {
    console.error('Membership PATCH Error:', error);
    return NextResponse.json(
      { success: false, error: '所属の更新に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> }
) {
  try {
    const { membershipId } = await params;
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    if (!canEditMembership(viewer.role)) {
      return NextResponse.json(
        { success: false, error: '所属を削除する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = body.action;

    if (action !== 'remove') {
      return NextResponse.json(
        { success: false, error: '無効なアクションです' },
        { status: 400 }
      );
    }

    const result = await repo.removeMember(membershipId, viewer.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Membership POST Error:', error);
    return NextResponse.json(
      { success: false, error: '所属の削除に失敗しました' },
      { status: 500 }
    );
  }
}
