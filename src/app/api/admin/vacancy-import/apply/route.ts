/**
 * 空室インポート Apply API
 *
 * POST /api/admin/vacancy-import/apply
 * スプレッドシートから読み込み、Firestore に反映
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchSheetRows } from '@/lib/vacancyImport/sheetsClient';
import { normalizeRow } from '@/lib/vacancyImport/normalizeRow';
import { apply } from '@/lib/vacancyImport/applyVacancySnapshot';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

const ALLOWED_ROLES: AppRole[] = ['admin', 'executive'];

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const role = user.role as AppRole;
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'この操作には管理者権限が必要です' },
        { status: 403 },
      );
    }

    const { rows } = await fetchSheetRows();
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        summary: { total: 0, created: 0, updated: 0, skipped: 0 },
      });
    }

    const normalized = rows
      .map((r) => normalizeRow(r.values, r.rowNumber))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const result = await apply(normalized);

    return NextResponse.json({
      success: true,
      summary: {
        total: result.total,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
      },
    });
  } catch (error) {
    console.error('[vacancy-import/apply]', error);
    return NextResponse.json(
      { error: '適用に失敗しました', detail: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
