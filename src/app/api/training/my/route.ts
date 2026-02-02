/**
 * 自分の研修API
 *
 * GET /api/training/my
 */

import { NextResponse } from 'next/server';
import { myTrainingSummary } from '@/lib/training/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET() {
  try {
    const summary = myTrainingSummary(DEMO_USER.id);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('training my GET error:', error);
    return NextResponse.json(
      { error: '研修情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
