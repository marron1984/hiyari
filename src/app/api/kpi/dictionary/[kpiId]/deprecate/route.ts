/**
 * KPI廃止API
 *
 * POST /api/kpi/dictionary/[kpiId]/deprecate - KPIを廃止（adminのみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { deprecateKPIDictionaryEntry } from '@/lib/kpiDictionary/repo';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kpiId: string }> }
) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  const { kpiId } = await params;

  // 管理者権限チェック
  if ((user.role as AppRole) !== 'admin') {
    return NextResponse.json(
      { error: 'アクセス権限がありません（管理者のみ）' },
      { status: 403 }
    );
  }

  let note: string | undefined;
  try {
    const body = await request.json();
    note = body.note;
  } catch {
    // ボディなしでもOK
  }

  const result = deprecateKPIDictionaryEntry(kpiId, user.uid, note);

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
