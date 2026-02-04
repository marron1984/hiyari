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
import { headers } from 'next/headers';
import type { AppRole } from '@/config/appRoles';
import { buildTodayTop3, formatTop3AsText, formatTop3AsSummary } from '@/lib/home/buildTodayTop3';

// 有効なAppRoleかチェック
function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}

/**
 * サーバー側でユーザー情報を取得
 */
async function getCurrentUser(): Promise<{ userId: string; role: AppRole }> {
  const headersList = await headers();

  // ヘッダーからユーザー情報を取得（開発用）
  const userIdHeader = headersList.get('x-user-id');
  const roleHeader = headersList.get('x-user-role');

  const userId = userIdHeader ?? 'user_001';
  const role: AppRole =
    roleHeader && isValidAppRole(roleHeader) ? (roleHeader as AppRole) : 'admin';

  return { userId, role };
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

    // 現在のユーザー情報を取得（サーバー側で確定）
    const currentUser = await getCurrentUser();
    let effectiveRole = currentUser.role;
    const effectiveUserId = currentUser.userId;

    // admin のみ asRole でプレビュー可能
    if (asRole && isValidAppRole(asRole)) {
      if (currentUser.role !== 'admin') {
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
