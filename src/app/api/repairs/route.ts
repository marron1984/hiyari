/**
 * 修繕管理API
 *
 * GET /api/repairs - 修繕一覧取得
 * GET /api/repairs?businessUnitId=xxx - 事業単位でフィルタ（Task 030）
 * POST /api/repairs - 修繕作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { listRepairs, createRepair } from '@/lib/repairs/repo';
import type { RepairStatus, RepairCategory, SafetyRisk } from '@/lib/repairs/types';
import type { AppRole } from '@/config/appRoles';
import { validateApiGuardrail } from '@/lib/scope/guardrail';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') as RepairStatus | null;
    const category = searchParams.get('category') as RepairCategory | null;
    const safetyRisk = searchParams.get('safetyRisk') as SafetyRisk | null;
    const q = searchParams.get('q');
    const overdueParam = searchParams.get('overdue');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    // Task 030: businessUnitId フィルタ
    const businessUnitIdParam = searchParams.get('businessUnitId');
    // 'null' 文字列は未分類を意味する
    const businessUnitId = businessUnitIdParam === 'null'
      ? null
      : (businessUnitIdParam ?? undefined);

    const filter = {
      status: status ?? undefined,
      category: category ?? undefined,
      safetyRisk: safetyRisk ?? undefined,
      businessUnitId,                    // Task 030
      q: q ?? undefined,
      overdue: overdueParam === 'true' ? true : undefined,
      limit: limitParam ? parseInt(limitParam, 10) : 50,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    };

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    const { repairs, total } = listRepairs(viewer, filter);

    return NextResponse.json({ repairs, total });
  } catch (error) {
    console.error('repairs GET error:', error);
    return NextResponse.json(
      { error: '修繕一覧の取得に失敗しました' },
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
      category,
      safetyRisk,
      businessUnitId,              // Task 030: 事業単位
      location,
      dueAt,
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'タイトルと説明は必須です' },
        { status: 400 }
      );
    }

    // Task 033: ガードレール検証（manager/leader は businessUnitId 必須）
    const guardrailResult = validateApiGuardrail(DEMO_USER.role, 'repairs', { businessUnitId });
    if (!guardrailResult.valid) {
      return NextResponse.json(
        { error: guardrailResult.error },
        { status: guardrailResult.status }
      );
    }

    const repair = createRepair(
      {
        title,
        description,
        category,
        safetyRisk,
        businessUnitId,            // Task 030
        location,
        dueAt,
      },
      DEMO_USER.id
    );

    return NextResponse.json({ repair }, { status: 201 });
  } catch (error) {
    console.error('repairs POST error:', error);
    return NextResponse.json(
      { error: '修繕の作成に失敗しました' },
      { status: 500 }
    );
  }
}
