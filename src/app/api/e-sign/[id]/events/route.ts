/**
 * 電子署名ログ 監査イベントAPI
 *
 * GET /api/e-sign/{id}/events - イベント一覧取得
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const viewer = getDemoUser();
    const { id } = await context.params;

    // レコードの閲覧権限確認
    const record = repo.getESignRecordById(id, viewer);
    if (!record) {
      return NextResponse.json(
        { success: false, error: '電子署名レコードが見つかりません' },
        { status: 404 }
      );
    }

    const events = repo.getESignEvents(id);

    return NextResponse.json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('[E-Sign API] GET events error:', error);
    return NextResponse.json(
      { success: false, error: 'イベントログの取得に失敗しました' },
      { status: 500 }
    );
  }
}
