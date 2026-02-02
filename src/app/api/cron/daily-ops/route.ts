/**
 * 日次オペレーション Cron API
 *
 * Implementation Ticket 045: 監視＆滞留防止の自動運用
 *
 * GET /api/cron/daily-ops?secret=...
 *   - 日次オペレーションを実行
 *   - 冪等（同日に既に成功している場合はスキップ）
 *
 * GET /api/cron/daily-ops?secret=...&preview=true
 *   - プレビュー実行（実際にアラート/通知を作成しない）
 *
 * GET /api/cron/daily-ops?secret=...&force=true
 *   - 強制実行（同日既に実行済みでも実行）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  executeDailyOps,
  previewDailyOps,
  listRecentRuns,
  getRunStats,
  type DailyOpsStepName,
  type NoiseSeverityThreshold,
} from '@/lib/dailyOps';

// Cron認証用シークレット
const DAILY_OPS_SECRET = process.env.DAILY_OPS_SECRET || process.env.ALERT_CRON_SECRET;

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
  if (!DAILY_OPS_SECRET) {
    console.warn('[DailyOps] DAILY_OPS_SECRET is not configured');
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return true;
  }

  return secretParam === DAILY_OPS_SECRET || token === DAILY_OPS_SECRET;
}

/**
 * GET /api/cron/daily-ops
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
  const thresholdParam = searchParams.get('threshold') as NoiseSeverityThreshold | null;
  const historyParam = searchParams.get('history');

  // 履歴取得
  if (historyParam === 'true') {
    const runs = listRecentRuns(30);
    const stats = getRunStats();

    return NextResponse.json({
      success: true,
      runs: runs.map((r) => ({
        id: r.id,
        date: r.date,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        ok: r.ok,
        totalAlertsCreated: r.totalAlertsCreated,
        totalAlertsSkipped: r.totalAlertsSkipped,
        totalNotifications: r.totalNotifications,
        stepsOk: r.steps.filter((s) => s.ok).length,
        stepsFailed: r.steps.filter((s) => !s.ok).length,
        errorMessage: r.errorMessage,
      })),
      stats,
    });
  }

  try {
    console.log(`[DailyOps] Starting ${preview ? 'preview' : 'execution'}...`);

    // オプション構築
    const options = {
      force,
      notificationThreshold: thresholdParam ?? ('warning' as NoiseSeverityThreshold),
      steps: stepsParam
        ? (stepsParam.split(',') as DailyOpsStepName[])
        : undefined,
    };

    // 実行
    const result = preview
      ? await previewDailyOps(options)
      : await executeDailyOps(options);

    console.log(
      `[DailyOps] Completed: ok=${result.run.ok}, skipped=${result.skipped}, created=${result.run.totalAlertsCreated}`
    );

    // レスポンス
    return NextResponse.json({
      success: true,
      preview,
      skipped: result.skipped,
      reason: result.reason,
      generatedAt: result.run.finishedAt ?? result.run.startedAt,
      run: {
        id: result.run.id,
        date: result.run.date,
        ok: result.run.ok,
        totalAlertsCreated: result.run.totalAlertsCreated,
        totalAlertsSkipped: result.run.totalAlertsSkipped,
        totalNotifications: result.run.totalNotifications,
        durationMs: result.run.finishedAt
          ? new Date(result.run.finishedAt).getTime() -
            new Date(result.run.startedAt).getTime()
          : 0,
        errorMessage: result.run.errorMessage,
      },
      steps: result.run.steps.map((s) => ({
        name: s.name,
        ok: s.ok,
        alertsCreated: s.alertsCreated,
        alertsSkipped: s.alertsSkipped,
        notificationsCreated: s.notificationsCreated,
        durationMs: s.durationMs,
        errorMessage: s.errorMessage,
      })),
    });
  } catch (error) {
    console.error('[DailyOps] Error:', error);

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
 * POST /api/cron/daily-ops
 * POSTでも同様に実行（Cron互換）
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
