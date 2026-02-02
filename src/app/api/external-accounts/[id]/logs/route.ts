/**
 * 外部アカウント監査ログ API
 * GET /api/external-accounts/{id}/logs - ログ取得
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/external-accounts/repo';
import type { ViewerContext, ExternalAuditAction } from '@/lib/external-accounts/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const viewer: ViewerContext = {
      userId: 'user_admin',
      role: 'admin',
    };

    // ユーザー存在確認
    const user = repo.getExternalUserById(id, viewer);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '外部アカウントが見つかりません' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') as ExternalAuditAction | null;
    const limitStr = searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    const logs = repo.getAuditLogs(viewer, {
      externalUserId: id,
      action: action ?? undefined,
      limit,
    });

    return NextResponse.json({ success: true, logs });
  } catch (error) {
    console.error('External Account Logs GET Error:', error);
    return NextResponse.json(
      { success: false, error: '監査ログの取得に失敗しました' },
      { status: 500 }
    );
  }
}
