/**
 * KPI算出リファレンス個別 API
 *
 * GET   - リファレンス取得
 * PATCH - リファレンス更新（admin/manager）
 * DELETE - リファレンス削除（admin）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCalculationRef,
  updateCalculationRef,
  deleteCalculationRef,
} from '@/lib/kpiDictionary/calculationRefRepo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { UpdateCalculationRefRequest } from '@/lib/kpiDictionary/types';

interface RouteContext {
  params: Promise<{ refId: string }>;
}

/**
 * GET /api/kpi/calculation-refs/[refId]
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { refId } = await context.params;
    const decodedRefId = decodeURIComponent(refId);

    const ref = getCalculationRef(decodedRefId);

    if (!ref) {
      return NextResponse.json(
        { error: 'リファレンスが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ref });
  } catch (error) {
    console.error('Failed to get calculation ref:', error);
    return NextResponse.json(
      { error: 'リファレンスの取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/kpi/calculation-refs/[refId]
 * admin/manager のみ
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { refId } = await context.params;
    const decodedRefId = decodeURIComponent(refId);

    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const role = user.role as string;
    if (!['admin', 'executive', 'manager'].includes(role)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const body: UpdateCalculationRefRequest = await request.json();

    const result = updateCalculationRef(decodedRefId, body);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ref: result.ref });
  } catch (error) {
    console.error('Failed to update calculation ref:', error);
    return NextResponse.json(
      { error: 'リファレンスの更新に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/kpi/calculation-refs/[refId]
 * admin のみ
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { refId } = await context.params;
    const decodedRefId = decodeURIComponent(refId);

    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      );
    }

    const result = deleteCalculationRef(decodedRefId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete calculation ref:', error);
    return NextResponse.json(
      { error: 'リファレンスの削除に失敗しました' },
      { status: 500 }
    );
  }
}
