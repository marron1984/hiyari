/**
 * KPI算出リファレンス API
 *
 * GET  - リファレンス一覧取得
 * POST - リファレンス作成（admin/manager）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listCalculationRefs,
  createCalculationRef,
  getCalculationRefStats,
} from '@/lib/kpiDictionary/calculationRefRepo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { CreateCalculationRefRequest } from '@/lib/kpiDictionary/types';

/**
 * GET /api/kpi/calculation-refs
 * クエリパラメータ:
 * - type: 'sql' | 'code' | 'vendor'
 * - q: 検索文字列
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'sql' | 'code' | 'vendor' | null;
    const q = searchParams.get('q');

    const refs = listCalculationRefs({
      type: type ?? undefined,
      q: q ?? undefined,
    });

    const stats = getCalculationRefStats();

    return NextResponse.json({
      refs,
      stats,
      total: refs.length,
    });
  } catch (error) {
    console.error('Failed to list calculation refs:', error);
    return NextResponse.json(
      { error: 'リファレンス一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/kpi/calculation-refs
 * admin/manager のみ
 */
export async function POST(request: NextRequest) {
  try {
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

    const body: CreateCalculationRefRequest = await request.json();

    // バリデーション
    if (!body.id || !body.type || !body.title) {
      return NextResponse.json(
        { error: 'id, type, title は必須です' },
        { status: 400 }
      );
    }

    const result = createCalculationRef(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ref: result.ref }, { status: 201 });
  } catch (error) {
    console.error('Failed to create calculation ref:', error);
    return NextResponse.json(
      { error: 'リファレンスの作成に失敗しました' },
      { status: 500 }
    );
  }
}
