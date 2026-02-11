/**
 * 研修コースAPI
 *
 * GET /api/training/courses - 一覧取得
 * POST /api/training/courses - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { listCourses, createCourse } from '@/lib/training/repo.firestore';
import { canManageTraining } from '@/lib/training/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import type { TrainingCategory } from '@/lib/training/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q') ?? undefined;
    const category = searchParams.get('category') as TrainingCategory | null;
    const activeParam = searchParams.get('active');

    const courses = await listCourses({
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
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer = { userId: user.uid, role: user.role as AppRole };

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

    const course = await createCourse(
      { title, description, category, frequency, required, defaultDueDays },
      user.uid
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
