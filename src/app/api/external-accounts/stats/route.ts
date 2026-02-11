/**
 * 外部アカウント統計 API
 * GET /api/external-accounts/stats - 統計取得（admin+）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/external-accounts/repo.firestore';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { ViewerContext } from '@/lib/external-accounts/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    const stats = await repo.getStats(viewer);

    if (!stats) {
      return NextResponse.json(
        { success: false, error: '統計を取得する権限がありません' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('External Accounts Stats Error:', error);
    return NextResponse.json(
      { success: false, error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
