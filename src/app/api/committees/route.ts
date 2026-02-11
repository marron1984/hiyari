/**
 * 委員会一覧・作成API
 *
 * GET  /api/committees - 委員会一覧取得
 * POST /api/committees - 委員会作成（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { listCommittees, createCommittee } from '@/lib/committees/repo';
import { canManageCommittees } from '@/lib/committees/types';
import type { CommitteeCategory } from '@/lib/committees/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || undefined;
    const category = searchParams.get('category') as CommitteeCategory | undefined;
    const activeParam = searchParams.get('active');
    const active = activeParam === 'true' ? true : activeParam === 'false' ? false : undefined;

    const committees = listCommittees({ q, category, active });

    return NextResponse.json({
      success: true,
      committees,
      total: committees.length,
    });
  } catch (error) {
    console.error('委員会一覧取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '委員会一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { name, category, required, cadence, defaultDueDayOfMonth, description } = body;

    if (!name || !category || !cadence) {
      return NextResponse.json(
        { success: false, error: '名前、カテゴリ、開催周期は必須です' },
        { status: 400 }
      );
    }

    const result = createCommittee(
      { name, category, required, cadence, defaultDueDayOfMonth, description },
      user.uid
    );

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
    console.error('委員会作成エラー:', error);
    return NextResponse.json(
      { success: false, error: '委員会の作成に失敗しました' },
      { status: 500 }
    );
  }
}
