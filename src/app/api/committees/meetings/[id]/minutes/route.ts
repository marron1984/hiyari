/**
 * 議事録API
 *
 * GET  /api/committees/meetings/[id]/minutes - 議事録取得
 * POST /api/committees/meetings/[id]/minutes - 議事録作成・更新（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getMinutes, upsertMinutes } from '@/lib/committees/repo';
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
    const minutes = getMinutes(id);

    return NextResponse.json({
      success: true,
      minutes,
    });
  } catch (error) {
    console.error('議事録取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '議事録の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const { summary, discussion, decisions, risks } = body;

    if (!summary) {
      return NextResponse.json(
        { success: false, error: '要点（summary）は必須です' },
        { status: 400 }
      );
    }

    const result = upsertMinutes(
      id,
      { summary, discussion, decisions, risks },
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
      minutes: result.minutes,
    });
  } catch (error) {
    console.error('議事録作成エラー:', error);
    return NextResponse.json(
      { success: false, error: '議事録の作成に失敗しました' },
      { status: 500 }
    );
  }
}
