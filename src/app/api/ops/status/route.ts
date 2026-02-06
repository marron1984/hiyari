/**
 * Ops ジョブステータス取得 API
 *
 * Implementation Ticket 067: ops-report 連動
 *
 * GET /api/ops/status?job=daily-ops|weekly-ops|notify-digest
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getLatestRun as getLatestDailyRun,
  getRunStats as getDailyRunStats,
} from '@/lib/dailyOps';
import {
  getLatestRun as getLatestWeeklyRun,
  getRunStats as getWeeklyRunStats,
} from '@/lib/weeklyOps';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const job = searchParams.get('job');

  if (!job) {
    return NextResponse.json(
      { error: 'job parameter is required' },
      { status: 400 }
    );
  }

  try {
    switch (job) {
      case 'daily-ops': {
        const latestRun = getLatestDailyRun();
        const stats = getDailyRunStats();

        return NextResponse.json({
          job: 'daily-ops',
          lastRun: latestRun
            ? {
                id: latestRun.id,
                date: latestRun.date,
                startedAt: latestRun.startedAt,
                finishedAt: latestRun.finishedAt,
                ok: latestRun.ok,
                stepsOk: latestRun.steps.filter((s) => s.ok).length,
                stepsFailed: latestRun.steps.filter((s) => !s.ok).length,
                totalAlertsCreated: latestRun.totalAlertsCreated,
                errorMessage: latestRun.errorMessage,
                failedSteps: latestRun.steps
                  .filter((s) => !s.ok)
                  .map((s) => s.name),
              }
            : null,
          stats: stats
            ? {
                totalRuns: stats.totalRuns,
                successRuns: stats.successfulRuns,
                failedRuns: stats.failedRuns,
                lastRunAt: stats.lastSuccessfulRun?.startedAt ?? null,
              }
            : null,
        });
      }

      case 'weekly-ops': {
        const latestRun = getLatestWeeklyRun();
        const stats = getWeeklyRunStats();

        return NextResponse.json({
          job: 'weekly-ops',
          lastRun: latestRun
            ? {
                id: latestRun.id,
                weekStart: latestRun.weekStart,
                startedAt: latestRun.startedAt,
                finishedAt: latestRun.finishedAt,
                ok: latestRun.ok,
                stepsOk: latestRun.steps.filter((s) => s.ok).length,
                stepsFailed: latestRun.steps.filter((s) => !s.ok).length,
                totalItemsProcessed: latestRun.totalItemsProcessed,
                errorMessage: latestRun.errorMessage,
                failedSteps: latestRun.steps
                  .filter((s) => !s.ok)
                  .map((s) => s.name),
              }
            : null,
          stats: stats
            ? {
                totalRuns: stats.totalRuns,
                successRuns: stats.successRuns,
                failedRuns: stats.failedRuns,
                lastRunAt: stats.lastRunAt,
              }
            : null,
        });
      }

      case 'notify-digest': {
        // notify-digest は実行ログを永続化していないため、
        // 最低限の情報のみ返す
        return NextResponse.json({
          job: 'notify-digest',
          lastRun: null,
          stats: null,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown job: ${job}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[OpsStatus] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
