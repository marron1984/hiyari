/**
 * 研修セッションAPI
 *
 * GET /api/training/sessions - 一覧取得
 * POST /api/training/sessions - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { listSessions, createSession } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';
import type { SessionStatus } from '@/lib/training/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const courseId = searchParams.get('courseId') ?? undefined;
    const status = searchParams.get('status') as SessionStatus | null;
    const dateFrom = searchParams.get('dateFrom') ?? undefined;
    const dateTo = searchParams.get('dateTo') ?? undefined;
    const q = searchParams.get('q') ?? undefined;

    const sessions = listSessions({
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
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const viewer = { userId: currentUser.id, role: currentUser.role };

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

    const result = createSession(
      { courseId, name, scheduledAt, durationMinutes, location, instructorName, notes },
      currentUser.id
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
