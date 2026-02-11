/**
 * KPI辞書詳細API
 *
 * GET /api/kpi/dictionary/[kpiId] - 辞書エントリ取得
 * PATCH /api/kpi/dictionary/[kpiId] - 辞書エントリ更新（admin or manager）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import {
  getKPIDictionaryEntry,
  updateKPIDictionaryEntry,
} from '@/lib/kpiDictionary/repo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kpiId: string }> }
) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;

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
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  const { kpiId } = await params;

  // 権限チェック（admin or manager）
  if (!(['admin', 'executive', 'manager'] as AppRole[]).includes(user.role as AppRole)) {
    return NextResponse.json(
      { error: 'アクセス権限がありません（管理職以上のみ）' },
      { status: 403 }
    );
  }

  const isAdmin = (user.role as AppRole) === 'admin';

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

  const result = updateKPIDictionaryEntry(kpiId, body, user.uid, note);

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
