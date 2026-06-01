/**
 * 研修コースAPI
 *
 * GET /api/training/courses - 一覧取得
 * POST /api/training/courses - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { listCourses, createCourse } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';
import type { TrainingCategory } from '@/lib/training/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q') ?? undefined;
    const category = searchParams.get('category') as TrainingCategory | null;
    const activeParam = searchParams.get('active');

    const courses = listCourses({
      q,
      category: category ?? undefined,
      active: activeParam === 'true' ? true : activeParam === 'false' ? false : undefined,
    });

    return NextResponse.json({ courses });
  } catch (error) {
    console.error('training courses GET error:', error);
    return NextResponse.json(
      { error: '研修コースの取得に失敗しました' },
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
        { error: '研修コースを作成する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, category, frequency, required, defaultDueDays } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'タイトルは必須です' },
        { status: 400 }
      );
    }

    const course = createCourse(
      { title, description, category, frequency, required, defaultDueDays },
      currentUser.id
    );

    return NextResponse.json({ course }, { status: 201 });
  } catch (error) {
    console.error('training courses POST error:', error);
    return NextResponse.json(
      { error: '研修コースの作成に失敗しました' },
      { status: 500 }
    );
  }
}
