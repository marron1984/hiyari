/**
 * KPI辞書詳細API
 *
 * GET /api/kpi/dictionary/[kpiId] - 辞書エントリ取得
 * PATCH /api/kpi/dictionary/[kpiId] - 辞書エントリ更新（admin or manager）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getKPIDictionaryEntry,
  updateKPIDictionaryEntry,
} from '@/lib/kpiDictionary/repo';
import { checkRole } from '@/lib/auth/requireRole';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kpiId: string }> }
) {
  const { kpiId } = await params;

  const entry = getKPIDictionaryEntry(kpiId);
  if (!entry) {
    return NextResponse.json(
      { error: 'KPIが見つかりません' },
      { status: 404 }
    );
  }

  return NextResponse.json({ entry });
}

export async function PATCH(
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

  const isAdmin = await checkRole(['admin']);
  const userId = request.headers.get('x-user-id') ?? 'unknown';

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが不正です' },
      { status: 400 }
    );
  }

  // isExternalAllowedはadminのみ変更可
  if (body.isExternalAllowed !== undefined && !isAdmin) {
    return NextResponse.json(
      { error: '外部公開設定の変更は管理者のみ可能です' },
      { status: 403 }
    );
  }

  const note = body.note;
  delete body.note;

  const result = updateKPIDictionaryEntry(kpiId, body, userId, note);

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
