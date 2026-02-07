/**
 * 空室インポート Dry-run API
 *
 * POST /api/admin/vacancy-import/dry-run
 * スプレッドシートから読み込み、差分プレビューを返却（書き込みなし）
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchSheetRows } from '@/lib/vacancyImport/sheetsClient';
import { normalizeRow } from '@/lib/vacancyImport/normalizeRow';
import { dryRun } from '@/lib/vacancyImport/applyVacancySnapshot';
import type { AppRole } from '@/config/appRoles';

const ALLOWED_ROLES: AppRole[] = ['admin', 'executive'];

export async function POST(request: NextRequest) {
  try {
    const role = (request.headers.get('x-user-role') || 'staff') as AppRole;
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'この操作には管理者権限が必要です' },
        { status: 403 },
      );
    }

    const { headers, rows } = await fetchSheetRows();
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        headers,
        result: { total: 0, created: 0, updated: 0, skipped: 0, diffs: [] },
      });
    }

    const normalized = rows
      .map((r) => normalizeRow(r.values, r.rowNumber))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const result = await dryRun(normalized);

    return NextResponse.json({
      success: true,
      headers,
      rowCount: rows.length,
      normalizedCount: normalized.length,
      result: {
        total: result.total,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        diffs: result.diffs,
      },
    });
  } catch (error) {
    console.error('[vacancy-import/dry-run]', error);
    return NextResponse.json(
      { error: 'dry-run に失敗しました', detail: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
