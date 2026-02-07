/**
 * 空室スプレッドシート同期 Cron API
 *
 * GET /api/cron/vacancy-sheet-sync
 * VACANCY_SOURCE === "sheet" のときのみ実行
 * CRON_SECRET 必須
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchSheetRows } from '@/lib/vacancyImport/sheetsClient';
import { normalizeRow } from '@/lib/vacancyImport/normalizeRow';
import { apply } from '@/lib/vacancyImport/applyVacancySnapshot';

function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  return false;
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const vacancySource = process.env.VACANCY_SOURCE || 'sheet';
  if (vacancySource !== 'sheet') {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: `VACANCY_SOURCE=${vacancySource}, not "sheet"`,
    });
  }

  try {
    console.log('[Cron:vacancy-sheet-sync] Starting...');

    const { rows } = await fetchSheetRows();
    const normalized = rows
      .map((r) => normalizeRow(r.values, r.rowNumber))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const result = await apply(normalized, 'sheet');

    console.log('[Cron:vacancy-sheet-sync] Done:', {
      total: result.total,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
    });

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
    console.error('[Cron:vacancy-sheet-sync] Error:', error);
    return NextResponse.json(
      { error: '同期に失敗しました', detail: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
