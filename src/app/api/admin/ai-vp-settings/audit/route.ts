/**
 * /api/admin/ai-vp-settings/audit - AI副社長スコアリング設定 監査ログ API
 *
 * Implementation Ticket 062: AI副社長Top3の重み（スコアリング）を管理画面から調整
 *
 * GET: 監査ログを取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { getAuditLog } from '@/lib/aiVp/scoringSettings';

/**
 * GET /api/admin/ai-vp-settings/audit
 *
 * 監査ログを取得
 * Query params:
 * - limit: number (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!['admin', 'manager'].includes(user.role as AppRole)) {
      return NextResponse.json(
        { error: 'Admin or manager access required' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const entries = getAuditLog({ limit });

    return NextResponse.json({
      entries,
      total: entries.length,
    });
  } catch (error) {
    console.error('[API /admin/ai-vp-settings/audit] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
