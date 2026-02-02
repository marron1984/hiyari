/**
 * ユーザー組織コンテキスト API
 * GET /api/org/me - 自分の組織コンテキストを取得
 */

import { NextResponse } from 'next/server';
import * as repo from '@/lib/org/repo';
import type { ViewerContext } from '@/lib/org/types';

export async function GET() {
  try {
    // TODO: 実際には認証から取得
    const viewer: ViewerContext = {
      userId: 'user_admin',
      role: 'admin',
    };

    const context = repo.getUserOrgContext(viewer.userId);

    return NextResponse.json({ success: true, context });
  } catch (error) {
    console.error('Org Me GET Error:', error);
    return NextResponse.json(
      { success: false, error: '組織コンテキストの取得に失敗しました' },
      { status: 500 }
    );
  }
}
