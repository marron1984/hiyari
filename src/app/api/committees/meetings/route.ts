/**
 * 開催回一覧・作成API
 *
 * GET  /api/committees/meetings - 開催回一覧取得
 * POST /api/committees/meetings - 開催回作成（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { listMeetings, createMeeting } from '@/lib/committees/repo';
import { canManageCommittees } from '@/lib/committees/types';
import type { MeetingStatus } from '@/lib/committees/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const committeeId = searchParams.get('committeeId') || undefined;
    const status = searchParams.get('status') as MeetingStatus | undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;

    const meetings = listMeetings({ committeeId, status, dateFrom, dateTo });

    return NextResponse.json({
      success: true,
      meetings,
      total: meetings.length,
    });
  } catch (error) {
    console.error('開催回一覧取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '開催回一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { committeeId, title, scheduledAt, location, notes } = body;

    if (!committeeId || !title || !scheduledAt) {
      return NextResponse.json(
        { success: false, error: '委員会ID、タイトル、予定日時は必須です' },
        { status: 400 }
      );
    }

    const result = createMeeting(
      { committeeId, title, scheduledAt, location, notes },
      currentUser.id
    );

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
    console.error('開催回作成エラー:', error);
    return NextResponse.json(
      { success: false, error: '開催回の作成に失敗しました' },
      { status: 500 }
    );
  }
}
