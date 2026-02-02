/**
 * 事業別サマリー API
 * GET /api/business/summary?businessUnitId=...&range=thisMonth
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/business/repo';
import type { ViewerContext, SummaryRange } from '@/lib/business/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? null;
    const range = (searchParams.get('range') as SummaryRange) || 'thisMonth';

    // モックViewer（管理者権限）
    const viewer: ViewerContext = {
      userId: 'user_manager',
      role: 'manager',
    };

    const summary = repo.generateBusinessSummary(viewer, businessUnitId, range);

    if (!summary) {
      return NextResponse.json(
        { success: false, error: 'サマリーを取得する権限がありません' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('Business Summary Error:', error);
    return NextResponse.json(
      { success: false, error: '事業サマリーの取得に失敗しました' },
      { status: 500 }
    );
  }
}
