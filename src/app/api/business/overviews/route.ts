/**
 * 事業別サマリー概要一覧 API
 * GET /api/business/overviews - 全事業の概要一覧取得（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/business/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { ViewerContext } from '@/lib/business/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    const overviews = await repo.getBusinessSummaryOverviews(viewer);

    return NextResponse.json({ success: true, overviews });
  } catch (error) {
    console.error('Business Overviews Error:', error);
    return NextResponse.json(
      { success: false, error: '概要一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
