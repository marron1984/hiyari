/**
 * KPIデータポイントAPI
 *
 * POST /api/kpi/[kpiId]/points - 新しいデータポイントを追加
 */

import { NextRequest, NextResponse } from 'next/server';
import { addKpiPoint, getKpiDefinition } from '@/lib/kpi/kpi-store.firestore';

interface AddPointRequest {
  date: string;
  value: number | null;
  source?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kpiId: string }> }
) {
  const { kpiId } = await params;

  // KPI定義を確認
  const definition = await getKpiDefinition(kpiId);
  if (!definition) {
    return NextResponse.json(
      { success: false, error: `KPI not found: ${kpiId}` },
      { status: 404 }
    );
  }

  try {
    const body: AddPointRequest = await request.json();

    // バリデーション
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json(
        { success: false, error: '日付はYYYY-MM-DD形式で指定してください' },
        { status: 400 }
      );
    }

    if (body.value !== null && typeof body.value !== 'number') {
      return NextResponse.json(
        { success: false, error: '値は数値またはnullで指定してください' },
        { status: 400 }
      );
    }

    // データポイントを追加
    const result = await addKpiPoint(kpiId, {
      date: body.date,
      value: body.value,
      source: body.source,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'データポイントを追加しました',
      kpiId,
      date: body.date,
      value: body.value,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'リクエストの解析に失敗しました' },
      { status: 400 }
    );
  }
}
