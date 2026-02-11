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
import { listRepairs, createRepair } from '@/lib/repairs/repo.firestore';
import type { RepairStatus, RepairCategory, SafetyRisk } from '@/lib/repairs/types';
import type { AppRole } from '@/config/appRoles';
import { validateApiGuardrail } from '@/lib/scope/guardrail';
import { processStaffCreation, requiresInference } from '@/lib/scope/inferBusinessUnit';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

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

    const viewer = { userId: user.uid, role: user.role as AppRole };
    const { repairs, total } = await listRepairs(viewer, filter);

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
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

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
    const guardrailResult = validateApiGuardrail(user.role as AppRole, 'repairs', { businessUnitId });
    if (!guardrailResult.valid) {
      return NextResponse.json(
        { error: guardrailResult.error },
        { status: guardrailResult.status }
      );
    }

    // Task 035: staff 向け businessUnitId 自動推定
    let finalBusinessUnitId = businessUnitId;
    if (requiresInference(user.role as AppRole)) {
      const inferResult = await processStaffCreation(
        user.uid,
        user.role as AppRole,
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

    const repair = await createRepair(
      {
        title,
        description,
        category,
        safetyRisk,
        businessUnitId: finalBusinessUnitId,  // Task 035: 推定結果を使用
        location,
        dueAt,
      },
      user.uid
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
