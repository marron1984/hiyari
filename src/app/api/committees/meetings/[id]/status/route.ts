/**
 * 開催回ステータス変更API
 *
 * POST /api/committees/meetings/[id]/status - ステータス変更（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { setMeetingStatus } from '@/lib/committees/repo.firestore';
import { canManageCommittees } from '@/lib/committees/types';
import type { MeetingStatus } from '@/lib/committees/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function POST(
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
    const { status, heldAt } = body as { status: MeetingStatus; heldAt?: string };

    if (!status || !['planned', 'held', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: '有効なステータスを指定してください' },
        { status: 400 }
      );
    }

    const result = await setMeetingStatus(id, status, user.uid, heldAt);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      meeting: result.meeting,
    });
  } catch (error) {
    console.error('開催回ステータス変更エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ステータスの変更に失敗しました' },
      { status: 500 }
    );
  }
}
