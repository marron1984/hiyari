/**
 * 研修コース詳細API
 *
 * GET /api/training/courses/[id] - 詳細取得
 * PATCH /api/training/courses/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCourse, updateCourse } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const course = getCourse(id);

    if (!course) {
      return NextResponse.json(
        { error: '研修コースが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ course });
  } catch (error) {
    console.error('training course GET error:', error);
    return NextResponse.json(
      { error: '研修コースの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };

    if (!canManageTraining(viewer)) {
      return NextResponse.json(
        { error: '研修コースを更新する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = updateCourse(id, body, DEMO_USER.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({ course: result.course });
  } catch (error) {
    console.error('training course PATCH error:', error);
    return NextResponse.json(
      { error: '研修コースの更新に失敗しました' },
      { status: 500 }
    );
  }
}
