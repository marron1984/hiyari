/**
 * 委員会サマリーAPI
 *
 * GET /api/committees/summaries - 委員会サマリー一覧取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCommitteeSummaries } from '@/lib/committees/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const summaries = getCommitteeSummaries();

    return NextResponse.json({
      success: true,
      summaries,
      total: summaries.length,
    });
  } catch (error) {
    console.error('委員会サマリー取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '委員会サマリーの取得に失敗しました' },
      { status: 500 }
    );
  }
}
