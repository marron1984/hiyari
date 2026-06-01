/**
 * 自分の研修API
 *
 * GET /api/training/my
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { myTrainingSummary } from '@/lib/training/repo';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const summary = myTrainingSummary(currentUser.id);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('training my GET error:', error);
    return NextResponse.json(
      { error: '研修情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
