/**
 * 組織ツリー API
 * GET /api/org/tree - ツリー取得
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/org/repo';
import type { ViewerContext } from '@/lib/org/types';
import { canViewOrgTree } from '@/lib/org/types';

export async function GET(request: NextRequest) {
  try {
    const viewer: ViewerContext = {
      userId: 'user_admin',
      role: 'admin',
    };

    // 閲覧権限チェック
    if (!canViewOrgTree(viewer.role)) {
      return NextResponse.json(
        { success: false, error: '組織ツリーを閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const tree = repo.getTree({ includeInactive });
    const stats = repo.getStats();

    return NextResponse.json({ success: true, tree, stats });
  } catch (error) {
    console.error('Org Tree GET Error:', error);
    return NextResponse.json(
      { success: false, error: '組織ツリーの取得に失敗しました' },
      { status: 500 }
    );
  }
}
