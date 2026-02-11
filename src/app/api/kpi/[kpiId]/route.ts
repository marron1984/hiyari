/**
 * 個別KPI API
 *
 * GET /api/kpi/[kpiId] - KPI詳細と時系列データを取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKpiDefinition, getKpiTimeSeries } from '@/lib/kpi/kpi-store.firestore';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kpiId: string }> }
) {
  const { kpiId } = await params;

  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const limit = searchParams.get('limit');

  // KPI定義を取得
  const definition = await getKpiDefinition(kpiId);
  if (!definition) {
    return NextResponse.json(
      { success: false, error: `KPI not found: ${kpiId}` },
      { status: 404 }
    );
  }

  // 時系列データを取得
  const timeSeries = await getKpiTimeSeries(kpiId, {
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });

  // 直近の値と変化を計算
  const points = timeSeries?.points ?? [];
  const currentValue = points.length > 0 ? points[points.length - 1].value : null;
  const previousValue = points.length > 1 ? points[points.length - 2].value : null;

  let changePercent: number | null = null;
  if (currentValue !== null && previousValue !== null && previousValue !== 0) {
    changePercent = ((currentValue - previousValue) / previousValue) * 100;
    changePercent = Math.round(changePercent * 10) / 10;
  }

  return NextResponse.json({
    success: true,
    kpi: {
      ...definition,
      currentValue,
      previousValue,
      changePercent,
    },
    timeSeries: {
      kpiId,
      points,
      count: points.length,
    },
  });
}
