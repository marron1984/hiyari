/**
 * 週次オペレーション Cron API
 *
 * Implementation Ticket 067: weekly-ops の本番運用固定
 *
 * GET /api/cron/weekly-ops?secret=...
 *   - 週次オペレーションを実行
 *   - 冪等（同週に既に成功している場合はスキップ）
 *
 * GET /api/cron/weekly-ops?secret=...&preview=true
 *   - プレビュー実行（実際にレポート/アラートを作成しない）
 *
 * GET /api/cron/weekly-ops?secret=...&force=true
 *   - 強制実行（同週既に実行済みでも実行）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  executeWeeklyOps,
  previewWeeklyOps,
  listRecentRuns,
  getRunStats,
  type WeeklyOpsStepName,
} from '@/lib/weeklyOps';
import { WEEKLY_OPS_SCHEDULE } from '@/config/opsSchedule';

// Cron認証用シークレット
const WEEKLY_OPS_SECRET = process.env.WEEKLY_OPS_SECRET || process.env.ALERT_CRON_SECRET;

/**
 * 認証チェック
 */
function checkAuth(request: NextRequest): boolean {
  // secretパラメータまたはAuthorizationヘッダー
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  // シークレットが設定されていない場合（開発環境）
  if (!WEEKLY_OPS_SECRET) {
    console.warn('[WeeklyOps] WEEKLY_OPS_SECRET is not configured');
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return true;
  }

  return secretParam === WEEKLY_OPS_SECRET || token === WEEKLY_OPS_SECRET;
}

/**
 * GET /api/cron/weekly-ops
 */
export async function GET(request: NextRequest) {
  // 認証チェック
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const preview = searchParams.get('preview') === 'true';
  const force = searchParams.get('force') === 'true';
  const stepsParam = searchParams.get('steps');
  const historyParam = searchParams.get('history');
  const weekStartParam = searchParams.get('weekStart');

  // 履歴取得
  if (historyParam === 'true') {
    const runs = listRecentRuns(20);
    const stats = getRunStats();

    return NextResponse.json({
      success: true,
      schedule: WEEKLY_OPS_SCHEDULE,
      runs: runs.map((r) => ({
        id: r.id,
        weekStart: r.weekStart,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        ok: r.ok,
        totalItemsProcessed: r.totalItemsProcessed,
        totalAlertsCreated: r.totalAlertsCreated,
        stepsOk: r.steps.filter((s) => s.ok).length,
        stepsFailed: r.steps.filter((s) => !s.ok).length,
        failedSteps: r.failedSteps,
        errorMessage: r.errorMessage,
      })),
      stats,
    });
  }

  try {
    console.log(`[WeeklyOps] Starting ${preview ? 'preview' : 'execution'}...`);

    // オプション構築
    const options = {
      force,
      steps: stepsParam
        ? (stepsParam.split(',') as WeeklyOpsStepName[])
        : undefined,
      weekStart: weekStartParam ?? undefined,
    };

    // 実行
    const result = preview
      ? await previewWeeklyOps(options)
      : await executeWeeklyOps(options);

    console.log(
      `[WeeklyOps] Completed: ok=${result.run.ok}, skipped=${result.skipped}, processed=${result.run.totalItemsProcessed}`
    );

    // レスポンス
    return NextResponse.json({
      success: true,
      preview,
      schedule: WEEKLY_OPS_SCHEDULE,
      skipped: result.skipped,
      reason: result.reason,
      generatedAt: result.run.finishedAt ?? result.run.startedAt,
      run: {
        id: result.run.id,
        weekStart: result.run.weekStart,
        ok: result.run.ok,
        totalItemsProcessed: result.run.totalItemsProcessed,
        totalAlertsCreated: result.run.totalAlertsCreated,
        durationMs: result.run.finishedAt
          ? new Date(result.run.finishedAt).getTime() -
            new Date(result.run.startedAt).getTime()
          : 0,
        errorMessage: result.run.errorMessage,
        failedSteps: result.run.failedSteps,
      },
      steps: result.run.steps.map((s) => ({
        name: s.name,
        ok: s.ok,
        itemsProcessed: s.itemsProcessed,
        alertsCreated: s.alertsCreated,
        durationMs: s.durationMs,
        errorMessage: s.errorMessage,
        reportUrl: s.reportUrl,
      })),
    });
  } catch (error) {
    console.error('[WeeklyOps] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/weekly-ops
 * POSTでも同様に実行（Cron互換）
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
