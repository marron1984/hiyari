/**
 * KPI定義一覧API
 *
 * GET /api/kpi/definitions - KPI定義一覧を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listKpiDefinitions, getKpiSummary } from '@/lib/kpi/kpi-store.firestore';
import type { KPICategory } from '@/lib/kpi/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get('category') as KPICategory | null;
  const externalOnly = searchParams.get('externalOnly') === 'true';

  const definitions = await listKpiDefinitions({
    category: category ?? undefined,
    externalOnly,
  });

  const summary = await getKpiSummary();

  return NextResponse.json({
    success: true,
    definitions: definitions.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      unit: d.unit,
      category: d.category,
      frequency: d.frequency,
      isExternalAllowed: d.isExternalAllowed,
      direction: d.direction,
      thresholds: d.thresholds,
      dashboardPath: d.dashboardPath,
    })),
    summary,
  });
}
