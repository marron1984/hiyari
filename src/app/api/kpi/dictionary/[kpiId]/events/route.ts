/**
 * KPI定義変更履歴API
 *
 * GET /api/kpi/dictionary/[kpiId]/events - 変更履歴取得（admin or manager）
 */

import { NextRequest, NextResponse } from 'next/server';
import { listKPIDefinitionEvents } from '@/lib/kpiDictionary/repo';
import { checkRole } from '@/lib/auth/requireRole';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kpiId: string }> }
) {
  const { kpiId } = await params;

  // 権限チェック（admin or manager）
  const hasPermission = await checkRole(['admin', 'executive', 'manager']);
  if (!hasPermission) {
    return NextResponse.json(
      { error: 'アクセス権限がありません（管理職以上のみ）' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const { events, total } = listKPIDefinitionEvents(kpiId, { limit, offset });

  return NextResponse.json({
    events,
    total,
  });
}
