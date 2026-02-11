/**
 * 空室コンバージョン計測統計API
 *
 * Ticket 072: /vacancies CTA最適化
 *
 * GET - 統計サマリー取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { getAnalyticsSummary } from '@/lib/vacancyAnalytics/repo';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const role = user.role as string;
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
