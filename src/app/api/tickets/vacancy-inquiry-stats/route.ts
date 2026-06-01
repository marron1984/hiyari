/**
 * 空室問い合わせ統計API
 *
 * Ticket 071: 空室問い合わせ CRM化
 *
 * GET /api/tickets/vacancy-inquiry-stats - 統計取得
 *
 * クエリパラメータ:
 * - businessUnitId: 事業単位ID（省略で全体）
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getVacancyInquiryStats } from '@/lib/tickets/repo';
import type { ViewerContext } from '@/lib/tickets/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId');

    const viewer: ViewerContext = {
      userId: currentUser.id,
      role: currentUser.role,
    };

    const stats = getVacancyInquiryStats(viewer, {
      businessUnitId: businessUnitId || undefined,
    });

    return NextResponse.json(stats);
  } catch (error) {
    console.error('vacancy-inquiry-stats GET error:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
