/**
 * 事業別サマリー API
 * GET /api/business/summary?businessUnitId=...&range=thisMonth
 *
 * Task 054: ロール別RBAC対応
 * - x-user-id / x-user-role ヘッダーからユーザー情報を取得
 * - staff/leader は finance 系が null になる
 * - admin は asRole でプレビュー可能
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import * as repo from '@/lib/business/repo';
import type { ViewerContext, SummaryRange } from '@/lib/business/types';
import type { AppRole } from '@/config/appRoles';

// 有効なAppRoleかチェック
function isValidAppRole(role: string): role is AppRole {
  return ['staff', 'leader', 'manager', 'executive', 'admin', 'auditor'].includes(role);
}

// ヘッダーからユーザー情報を取得
async function getViewerFromHeaders(): Promise<{ userId: string; role: AppRole }> {
  const headersList = await headers();
  const userIdHeader = headersList.get('x-user-id');
  const roleHeader = headersList.get('x-user-role');

  const userId = userIdHeader ?? 'user_001'; // デフォルト（開発用）
  const role: AppRole =
    roleHeader && isValidAppRole(roleHeader) ? (roleHeader as AppRole) : 'manager';

  return { userId, role };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? null;
    const range = (searchParams.get('range') as SummaryRange) || 'thisMonth';
    const asRole = searchParams.get('asRole');

    // ヘッダーからユーザー情報を取得
    const { userId, role: headerRole } = await getViewerFromHeaders();

    // Task 054: admin のみ asRole でプレビュー可能
    let effectiveRole = headerRole;
    if (asRole && isValidAppRole(asRole) && headerRole === 'admin') {
      effectiveRole = asRole;
    }

    const viewer: ViewerContext = {
      userId,
      role: effectiveRole,
    };

    const summary = repo.generateBusinessSummary(viewer, businessUnitId, range);

    if (!summary) {
      return NextResponse.json(
        { success: false, error: 'サマリーを取得する権限がありません' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      summary,
      // Task 054: デバッグ用（本番では削除可）
      _debug: {
        viewerRole: effectiveRole,
        hasFinanceAccess: ['manager', 'executive', 'admin', 'auditor'].includes(effectiveRole),
      },
    });
  } catch (error) {
    console.error('Business Summary Error:', error);
    return NextResponse.json(
      { success: false, error: '事業サマリーの取得に失敗しました' },
      { status: 500 }
    );
  }
}
