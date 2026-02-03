/**
 * 電子署名ログ 統計API
 *
 * GET /api/e-sign/stats - 統計情報取得
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/esign/repo';
import type { AppRole } from '@/config/appRoles';

// デモ用ユーザー
function getDemoUser(): repo.ViewerContext {
  return {
    userId: 'user_manager',
    role: 'manager' as AppRole,
  };
}

export async function GET(request: NextRequest) {
  try {
    const viewer = getDemoUser();
    const stats = repo.getStats(viewer);

    if (!stats) {
      return NextResponse.json(
        { success: false, error: '統計情報の閲覧権限がありません' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[E-Sign API] GET stats error:', error);
    return NextResponse.json(
      { success: false, error: '統計情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
