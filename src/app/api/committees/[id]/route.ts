/**
 * 委員会詳細・更新API
 *
 * GET   /api/committees/[id] - 委員会詳細取得
 * PATCH /api/committees/[id] - 委員会更新（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getCommittee, updateCommittee } from '@/lib/committees/repo';
import { canManageCommittees } from '@/lib/committees/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const committee = getCommittee(id);

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
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!canManageCommittees(currentUser)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const result = updateCommittee(id, body, currentUser.id);

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
