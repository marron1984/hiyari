// ======== AI副社長「今日のTODO」自動生成 Cron API ========
// Vercel Cronで毎日 JST 06:00（UTC 21:00）に実行

import { NextRequest, NextResponse } from 'next/server';
import { generateDailyTodos } from '@/lib/todo-generator';

/**
 * Vercel Cronからのリクエストを認証
 */
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

/**
 * GET: TODO生成バッチを実行（Vercel Cronから呼び出し）
 */
export async function GET(request: NextRequest) {
  // 認証チェック
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron] Starting daily TODO generation...');

  try {
    const result = await generateDailyTodos();

    console.log('[Cron] TODO generation completed:', {
      success: result.success,
      total: result.summary.total,
      byPriority: result.summary.byPriority,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (error) {
    console.error('[Cron] TODO generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

/**
 * POST: 手動トリガー用
 */
export async function POST(request: NextRequest) {
  // Bearer token認証（管理者API経由）
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // GETと同じ処理を実行
  return GET(request);
}
