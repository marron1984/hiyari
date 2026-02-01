/**
 * 委員会詳細・更新API
 *
 * GET   /api/committees/[id] - 委員会詳細取得
 * PATCH /api/committees/[id] - 委員会更新（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCommittee, updateCommittee } from '@/lib/committees/repo';
import { canManageCommittees } from '@/lib/committees/types';

// デモ用ユーザー
const DEMO_USER = {
  userId: 'user_manager',
  role: 'manager' as const,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    if (!canManageCommittees(DEMO_USER)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const result = updateCommittee(id, body, DEMO_USER.userId);

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
