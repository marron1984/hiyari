/**
 * 是正措置API
 *
 * GET /api/corrective-actions       - 一覧取得
 * POST /api/corrective-actions      - 新規作成
 *
 * Task 030: businessUnitId フィルタ対応
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listCorrectiveActions,
  create,
} from '@/lib/correctiveActions/repo';
import type {
  CorrectiveActionStatus,
  CorrectiveActionSeverity,
  SourceType,
} from '@/lib/correctiveActions/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Task 030: businessUnitId フィルタ
    const businessUnitIdParam = searchParams.get('businessUnitId');
    // 'null' 文字列は未分類を意味する
    const businessUnitId = businessUnitIdParam === 'null'
      ? null
      : (businessUnitIdParam ?? undefined);

    const status = searchParams.get('status') as CorrectiveActionStatus | null;
    const severity = searchParams.get('severity') as CorrectiveActionSeverity | null;
    const sourceType = searchParams.get('sourceType') as SourceType | null;
    const overdue = searchParams.get('overdue') === 'true';
    const q = searchParams.get('q');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined;

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    const result = listCorrectiveActions(viewer, {
      businessUnitId,
      status: status ?? undefined,
      severity: severity ?? undefined,
      sourceType: sourceType ?? undefined,
      overdue: overdue || undefined,
      q: q ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      items: result.items,
      total: result.total,
    });
  } catch (error) {
    console.error('corrective-actions GET error:', error);
    return NextResponse.json(
      { error: '是正措置の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      title,
      description,
      severity,
      sourceType,
      sourceId,
      businessUnitId,
      rootCause,
      actionPlan,
      ownerUserId,
      dueAt,
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'タイトルと説明は必須です' },
        { status: 400 }
      );
    }

    const ca = create(
      {
        title,
        description,
        severity,
        sourceType,
        sourceId,
        businessUnitId: businessUnitId ?? null,  // Task 030
        rootCause,
        actionPlan,
        ownerUserId,
        dueAt,
      },
      DEMO_USER.id
    );

    return NextResponse.json({ success: true, item: ca }, { status: 201 });
  } catch (error) {
    console.error('corrective-actions POST error:', error);
    return NextResponse.json(
      { error: '是正措置の作成に失敗しました' },
      { status: 500 }
    );
  }
}
