/**
 * 同意書統計 API
 * GET /api/agreements/stats - 統計取得（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/agreements/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { ViewerContext } from '@/lib/agreements/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    const stats = repo.getStats(viewer);

    if (!stats) {
      return NextResponse.json(
        { success: false, error: '統計を取得する権限がありません' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('Agreement Stats Error:', error);
    return NextResponse.json(
      { success: false, error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
