/**
 * KPI廃止API
 *
 * POST /api/kpi/dictionary/[kpiId]/deprecate - KPIを廃止（adminのみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { deprecateKPIDictionaryEntry } from '@/lib/kpiDictionary/repo';
import { checkRole } from '@/lib/auth/requireRole';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kpiId: string }> }
) {
  const { kpiId } = await params;

  // 管理者権限チェック
  const isAdmin = await checkRole(['admin']);
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'アクセス権限がありません（管理者のみ）' },
      { status: 403 }
    );
  }

  const userId = request.headers.get('x-user-id') ?? 'admin';

  let note: string | undefined;
  try {
    const body = await request.json();
    note = body.note;
  } catch {
    // ボディなしでもOK
  }

  const result = deprecateKPIDictionaryEntry(kpiId, userId, note);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    entry: result.entry,
  });
}
