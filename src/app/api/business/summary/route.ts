/**
 * 事業別サマリー API
 * GET /api/business/summary?businessUnitId=...&range=thisMonth
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/business/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { ViewerContext, SummaryRange } from '@/lib/business/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? null;
    const range = (searchParams.get('range') as SummaryRange) || 'thisMonth';

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    const summary = await repo.generateBusinessSummary(viewer, businessUnitId, range);

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
