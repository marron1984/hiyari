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
import { requireApiUser, isApiUser } from '@/lib/api-auth';
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
 * GET /api/home/summary
 *
 * Query params:
 * - asRole: AppRole (optional) - admin限定プレビュー用
 *
 * Task 053 セキュリティ強化:
 * - クエリの userId/role は無視（偽装防止）
 * - userId はサーバー側でセッションから確定
 * - asRole は admin のみ使用可能
 * - canViewFinance=false の role には receivables/contracts を返さない
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const asRole = searchParams.get('asRole');

    // 認証
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // Task 053: クエリの userId/role は明示的に無視（偽装防止）
    // これらのパラメータがあっても使用しない
    const _ignoredUserId = searchParams.get('userId');
    const _ignoredRole = searchParams.get('role');
    if (_ignoredUserId || _ignoredRole) {
      console.warn('[API /home/summary] Ignored spoofing attempt: userId/role params are not allowed');
    }

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

    // ロール別ウィジェット設定を取得
    const widgetTypes: WidgetType[] = ROLE_WIDGET_CONFIG[effectiveRole] ?? [];

    // ウィジェットを構築
    const widgets = await buildWidgetsForRole(effectiveRole, effectiveUserId, widgetTypes);

    // Task 053: 役職に応じたウィジェットフィルタリング
    // canViewFinance=true の役職
    const financeRoles: AppRole[] = ['admin', 'executive', 'manager', 'auditor'];
    const canViewFinance = financeRoles.includes(effectiveRole);

    const filteredWidgets = widgets.filter(w => {
      // 財務系ウィジェットは canViewFinance=true の役職のみ
      const financeWidgets: WidgetType[] = ['receivables', 'contracts'];
      if (financeWidgets.includes(w.type) && !canViewFinance) {
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
