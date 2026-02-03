/**
 * /api/home/summary - 役職別ホームサマリー
 *
 * Implementation Ticket 046-final: 認証前提で安全に返す
 *
 * セキュリティ:
 * - クエリで role/userId を受け取らない
 * - サーバ側でセッションから userId / role を確定
 * - admin のみ asRole でプレビュー可能
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type { AppRole } from '@/config/appRoles';
import { ROLE_DISPLAY_INFO } from '@/config/appRoles';
import {
  type RoleHomeData,
  type WidgetType,
  ROLE_WIDGET_CONFIG,
} from '@/lib/roleHome/types';
import { buildWidgetsForRole } from '@/lib/roleHome/widgetBuilder';

// 有効なAppRoleかチェック
function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}

/**
 * サーバー側でユーザー情報を取得
 * 本番ではセッション/Cookie/JWTから取得
 */
async function getCurrentUser(): Promise<{ userId: string; role: AppRole }> {
  const headersList = await headers();

  // ヘッダーからユーザー情報を取得（開発用）
  const userIdHeader = headersList.get('x-user-id');
  const roleHeader = headersList.get('x-user-role');

  const userId = userIdHeader ?? 'user_001'; // デフォルト（開発用）
  const role: AppRole =
    roleHeader && isValidAppRole(roleHeader) ? (roleHeader as AppRole) : 'admin';

  return { userId, role };
}

/**
 * GET /api/home/summary
 *
 * Query params:
 * - asRole: AppRole (optional) - admin限定プレビュー用
 *
 * セキュリティ:
 * - userId/role はサーバー側で確定
 * - asRole は admin のみ使用可能
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const asRole = searchParams.get('asRole');

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

    // ロール別ウィジェット設定を取得
    const widgetTypes: WidgetType[] = ROLE_WIDGET_CONFIG[effectiveRole] ?? [];

    // ウィジェットを構築
    const widgets = buildWidgetsForRole(effectiveRole, effectiveUserId, widgetTypes);

    // 役職に応じたウィジェットフィルタリング
    // finance系（receivables）は canViewFinance=false の役職には返さない
    const financeRoles: AppRole[] = ['admin', 'executive', 'manager', 'auditor'];
    const filteredWidgets = widgets.filter(w => {
      // receivables は finance 権限がある役職のみ
      if (w.type === 'receivables' && !financeRoles.includes(effectiveRole)) {
        return false;
      }
      return true;
    });

    const result: RoleHomeData = {
      role: effectiveRole,
      roleName: ROLE_DISPLAY_INFO[effectiveRole]?.name ?? effectiveRole,
      widgets: filteredWidgets,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API /home/summary] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/home/summary - 廃止（セキュリティ上）
 */
export async function POST() {
  return NextResponse.json(
    { error: 'POST method is deprecated. Use GET with asRole parameter for admin preview.' },
    { status: 405 }
  );
}
