/**
 * KPIハイライトAPI
 *
 * GET /api/kpi/highlights - ダッシュボード用KPIハイライトを取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKpiHighlights } from '@/lib/kpi/kpi-store.firestore';
import type { KPICategory } from '@/lib/kpi/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get('category') as KPICategory | null;
  const externalOnly = searchParams.get('externalOnly') === 'true';
  const limit = searchParams.get('limit');

  const highlights = await getKpiHighlights({
    category: category ?? undefined,
    externalOnly,
    limit: limit ? parseInt(limit, 10) : undefined,
  });

  // カテゴリ別にグループ化
  const byCategory: Record<string, typeof highlights> = {};
  for (const h of highlights) {
    if (!byCategory[h.category]) {
      byCategory[h.category] = [];
    }
    byCategory[h.category].push(h);
  }

  // ステータス別集計
  const statusCounts = {
    good: highlights.filter((h) => h.status === 'good').length,
    warning: highlights.filter((h) => h.status === 'warning').length,
    critical: highlights.filter((h) => h.status === 'critical').length,
    neutral: highlights.filter((h) => h.status === 'neutral').length,
  };

  return NextResponse.json({
    success: true,
    highlights,
    byCategory,
    statusCounts,
    total: highlights.length,
  });
}
