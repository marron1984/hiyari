/**
 * 修繕管理API
 *
 * GET /api/repairs - 修繕一覧取得
 * GET /api/repairs?businessUnitId=xxx - 事業単位でフィルタ（Task 030）
 * POST /api/repairs - 修繕作成
 *
 * Task 033: ガードレール検証
 * Task 035: staff 向け businessUnitId 自動推定
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { listRepairs, createRepair } from '@/lib/repairs/repo';
import type { RepairStatus, RepairCategory, SafetyRisk } from '@/lib/repairs/types';
import { validateApiGuardrail } from '@/lib/scope/guardrail';
import { processStaffCreation, requiresInference } from '@/lib/scope/inferBusinessUnit';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

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

    const viewer = { userId: currentUser.id, role: currentUser.role };
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
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

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
    const guardrailResult = validateApiGuardrail(currentUser.role, 'repairs', { businessUnitId });
    if (!guardrailResult.valid) {
      return NextResponse.json(
        { error: guardrailResult.error },
        { status: guardrailResult.status }
      );
    }

    // Task 035: staff 向け businessUnitId 自動推定
    let finalBusinessUnitId = businessUnitId;
    if (requiresInference(currentUser.role)) {
      const inferResult = processStaffCreation(
        currentUser.id,
        currentUser.role,
        'repairs',
        businessUnitId,
        { location }  // ヒント: locationで推定精度向上
      );

      if (inferResult.needsSelection) {
        return NextResponse.json(
          {
            error: inferResult.reason,
            needsSelection: true,
            candidates: inferResult.candidates,
          },
          { status: 422 }
        );
      }

      finalBusinessUnitId = inferResult.businessUnitId;
    }

    const repair = createRepair(
      {
        title,
        description,
        category,
        safetyRisk,
        businessUnitId: finalBusinessUnitId,  // Task 035: 推定結果を使用
        location,
        dueAt,
      },
      currentUser.id
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
