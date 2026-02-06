/**
 * 空室コンバージョン計測統計API
 *
 * Ticket 072: /vacancies CTA最適化
 *
 * GET - 統計サマリー取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAnalyticsSummary } from '@/lib/vacancyAnalytics/repo';
import type { AppRole } from '@/config/appRoles';

// 有効なAppRoleかチェック
function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}

export async function GET(request: NextRequest) {
  try {
    // 認証チェック（管理者のみ）
    const headersList = await headers();
    const roleHeader = headersList.get('x-user-role');
    const role: AppRole = isValidAppRole(roleHeader ?? '') ? roleHeader as AppRole : 'staff';

    if (!['admin', 'executive', 'manager'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // クエリパラメータ
    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const summary = getAnalyticsSummary({
      businessUnitId,
      startDate,
      endDate,
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Vacancy analytics summary error:', error);
    return NextResponse.json(
      { error: 'Failed to get analytics summary' },
      { status: 500 }
    );
  }
}
