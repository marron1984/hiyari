/**
 * 自分の研修API
 *
 * GET /api/training/my
 */

import { NextRequest, NextResponse } from 'next/server';
import { myTrainingSummary } from '@/lib/training/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const summary = myTrainingSummary(user.uid);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('training my GET error:', error);
    return NextResponse.json(
      { error: '研修情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
