/**
 * /api/home/today-top3 - 今日のTop3 API
 *
 * Implementation Ticket 060: 朝イチダイジェスト通知（055）と Role Home（059）を連動
 *
 * 役職別の「今日のTop3」を返す
 * - Role Home と ダイジェスト通知で同じロジックを使用
 * - セキュリティ: サーバー側でセッションから userId / role を確定
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { buildTodayTop3, formatTop3AsText, formatTop3AsSummary } from '@/lib/home/buildTodayTop3';

// 有効なAppRoleかチェック
function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}


/**
 * GET /api/home/today-top3
 *
 * Query params:
 * - asRole: AppRole (optional) - admin限定プレビュー用
 * - format: 'json' | 'text' | 'summary' (default: 'json')
 *
 * Response:
 * - format=json: TodayTop3Result
 * - format=text: string[] (通知本文用)
 * - format=summary: string (1行サマリー)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const asRole = searchParams.get('asRole');
    const format = searchParams.get('format') || 'json';

    // 認証
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    let effectiveRole = user.role as AppRole;
    const effectiveUserId = user.uid;

    // admin のみ asRole でプレビュー可能
    if (asRole && isValidAppRole(asRole)) {
      if ((user.role as AppRole) !== 'admin') {
        return NextResponse.json(
          { error: 'asRole is only available for admin users' },
          { status: 403 }
        );
      }
      effectiveRole = asRole as AppRole;
    }

    // Top3を生成
    const result = buildTodayTop3(effectiveRole, effectiveUserId);

    // フォーマット別に返却
    switch (format) {
      case 'text':
        return NextResponse.json({
          role: effectiveRole,
          date: result.date,
          lines: formatTop3AsText(result),
        });

      case 'summary':
        return NextResponse.json({
          role: effectiveRole,
          date: result.date,
          summary: formatTop3AsSummary(result),
        });

      case 'json':
      default:
        return NextResponse.json(result);
    }
  } catch (error) {
    console.error('[API /home/today-top3] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
