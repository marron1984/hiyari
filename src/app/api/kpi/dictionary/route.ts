/**
 * KPI辞書API
 *
 * GET /api/kpi/dictionary - 辞書一覧取得
 * POST /api/kpi/dictionary - 辞書エントリ作成（adminのみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import {
  listKPIDictionary,
  createKPIDictionaryEntry,
  getAllTags,
} from '@/lib/kpiDictionary/repo';
import type { KPIStatus } from '@/lib/kpiDictionary/types';
import type { KPICategory } from '@/lib/kpi/types';

export async function GET(request: NextRequest) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? undefined;
  const status = searchParams.get('status') as KPIStatus | null;
  const category = searchParams.get('category') as KPICategory | null;
  const tag = searchParams.get('tag') ?? undefined;
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const { entries, total } = listKPIDictionary({
    q,
    status: status ?? undefined,
    category: category ?? undefined,
    tag,
    limit,
    offset,
  });

  // 全タグも返す（フィルタ用）
  const allTags = getAllTags();

  return NextResponse.json({
    entries,
    total,
    tags: allTags,
  });
}

export async function POST(request: NextRequest) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  // 管理者権限チェック
  if ((user.role as AppRole) !== 'admin') {
    return NextResponse.json(
      { error: 'アクセス権限がありません（管理者のみ）' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが不正です' },
      { status: 400 }
    );
  }

  // バリデーション
  if (!body.id || !body.name || !body.unit || !body.category || !body.frequency || !body.direction) {
    return NextResponse.json(
      { error: '必須項目が不足しています（id, name, unit, category, frequency, direction）' },
      { status: 400 }
    );
  }

  const result = createKPIDictionaryEntry(body, user.uid);

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
