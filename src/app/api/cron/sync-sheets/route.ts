// Google Sheets 定期同期 Cron API
// Vercel Cronで1時間ごとに実行

import { NextRequest, NextResponse } from 'next/server';
import { syncAllFromSheets, setSheetGid, getSheetGid } from '@/lib/sheets-sync';

// Vercel Cronからのリクエストを認証
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');

  // Vercel Cron Secretによる認証
  if (process.env.CRON_SECRET) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }

  // 開発環境では認証をスキップ
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

// GET: 同期実行（Vercel Cronから呼び出し）
export async function GET(request: NextRequest) {
  // 認証チェック
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron] Starting Google Sheets sync...');

    const result = await syncAllFromSheets();

    console.log('[Cron] Sync completed:', {
      residents: { synced: result.residents.synced, errors: result.residents.errors.length },
      vacancies: { synced: result.vacancies.synced, errors: result.vacancies.errors.length },
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Cron] Sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

// POST: gid設定を更新
export async function POST(request: NextRequest) {
  // 認証チェック（管理者のみ）
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { residents, vacancies, prospects } = body;

    if (typeof residents === 'number') {
      setSheetGid('residents', residents);
    }
    if (typeof vacancies === 'number') {
      setSheetGid('vacancies', vacancies);
    }
    if (typeof prospects === 'number') {
      setSheetGid('prospects', prospects);
    }

    return NextResponse.json({
      success: true,
      current: getSheetGid(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}
