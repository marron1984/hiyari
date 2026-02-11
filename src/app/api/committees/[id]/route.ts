/**
 * 委員会詳細・更新API
 *
 * GET   /api/committees/[id] - 委員会詳細取得
 * PATCH /api/committees/[id] - 委員会更新（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCommittee, updateCommittee } from '@/lib/committees/repo.firestore';
import { canManageCommittees } from '@/lib/committees/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const { id } = await params;
    const committee = await getCommittee(id);

    if (!committee) {
      return NextResponse.json(
        { success: false, error: '委員会が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      committee,
    });
  } catch (error) {
    console.error('委員会詳細取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '委員会の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canManageCommittees({ userId: user.uid, role: user.role as AppRole })) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const result = await updateCommittee(id, body, user.uid);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      committee: result.committee,
    });
  } catch (error) {
    console.error('委員会更新エラー:', error);
    return NextResponse.json(
      { success: false, error: '委員会の更新に失敗しました' },
      { status: 500 }
    );
  }
}
