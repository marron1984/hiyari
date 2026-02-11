/**
 * 開催回詳細・更新API
 *
 * GET   /api/committees/meetings/[id] - 開催回詳細取得
 * PATCH /api/committees/meetings/[id] - 開催回更新（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getMeeting,
  updateMeeting,
  getCommittee,
  getMinutes,
  listActionItems,
  getMeetingStats,
} from '@/lib/committees/repo.firestore';
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
    const meeting = await getMeeting(id);

    if (!meeting) {
      return NextResponse.json(
        { success: false, error: '開催回が見つかりません' },
        { status: 404 }
      );
    }

    const committee = await getCommittee(meeting.committeeId);
    const minutes = await getMinutes(id);
    const actionItems = await listActionItems({ meetingId: id });
    const stats = await getMeetingStats(id);

    return NextResponse.json({
      success: true,
      meeting,
      committee,
      minutes,
      actionItems,
      stats,
    });
  } catch (error) {
    console.error('開催回詳細取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '開催回の取得に失敗しました' },
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

    const result = await updateMeeting(id, body, user.uid);

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
    console.error('開催回更新エラー:', error);
    return NextResponse.json(
      { success: false, error: '開催回の更新に失敗しました' },
      { status: 500 }
    );
  }
}
