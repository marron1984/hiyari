/**
 * 研修セッションAPI
 *
 * GET /api/training/sessions - 一覧取得
 * POST /api/training/sessions - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { listSessions, createSession } from '@/lib/training/repo.firestore';
import { canManageTraining } from '@/lib/training/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import type { SessionStatus } from '@/lib/training/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const { searchParams } = new URL(request.url);

    const courseId = searchParams.get('courseId') ?? undefined;
    const status = searchParams.get('status') as SessionStatus | null;
    const dateFrom = searchParams.get('dateFrom') ?? undefined;
    const dateTo = searchParams.get('dateTo') ?? undefined;
    const q = searchParams.get('q') ?? undefined;

    const sessions = await listSessions({
      courseId,
      status: status ?? undefined,
      dateFrom,
      dateTo,
      q,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('training sessions GET error:', error);
    return NextResponse.json(
      { error: '研修セッションの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer = { userId: user.uid, role: user.role as AppRole };

    if (!canManageTraining(viewer)) {
      return NextResponse.json(
        { error: '研修セッションを作成する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { courseId, name, scheduledAt, durationMinutes, location, instructorName, notes } = body;

    if (!courseId || !name || !scheduledAt) {
      return NextResponse.json(
        { error: 'コースID、名前、開催日時は必須です' },
        { status: 400 }
      );
    }

    const result = await createSession(
      { courseId, name, scheduledAt, durationMinutes, location, instructorName, notes },
      user.uid
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ session: result.session }, { status: 201 });
  } catch (error) {
    console.error('training sessions POST error:', error);
    return NextResponse.json(
      { error: '研修セッションの作成に失敗しました' },
      { status: 500 }
    );
  }
}
