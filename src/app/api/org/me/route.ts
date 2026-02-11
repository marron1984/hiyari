/**
 * ユーザー組織コンテキスト API
 * GET /api/org/me - 自分の組織コンテキストを取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import * as repo from '@/lib/org/repo';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const context = repo.getUserOrgContext(user.uid);

    return NextResponse.json({ success: true, context });
  } catch (error) {
    console.error('Org Me GET Error:', error);
    return NextResponse.json(
      { success: false, error: '組織コンテキストの取得に失敗しました' },
      { status: 500 }
    );
  }
}
