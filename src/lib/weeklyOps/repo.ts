/**
 * 週次オペレーション実行ログリポジトリ
 *
 * Implementation Ticket 067: weekly-ops の本番運用固定
 *
 * インメモリ + ファイル永続化（dailyOpsと同様のパターン）
 */

import type { WeeklyOpsRun, WeeklyOpsStepResult, WeeklyOpsStepName } from './types';
import { getWeekStartDate } from './types';

// ========== インメモリストレージ ==========

let weeklyOpsRuns: WeeklyOpsRun[] = [];

// ========== CRUD ==========

/**
 * 新規実行を開始
 */
export function startRun(weekStart: string): WeeklyOpsRun {
  const run: WeeklyOpsRun = {
    id: `weekly_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    weekStart,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: true,
    steps: [],
    totalItemsProcessed: 0,
    totalAlertsCreated: 0,
  };

  weeklyOpsRuns.push(run);
  return run;
}

/**
 * ステップ結果を追加
 */
export function addStepResult(runId: string, result: WeeklyOpsStepResult): void {
  const run = weeklyOpsRuns.find((r) => r.id === runId);
  if (!run) return;

  run.steps.push(result);
  run.totalItemsProcessed += result.itemsProcessed;
  run.totalAlertsCreated += result.alertsCreated;

  // 失敗したステップを記録
  if (!result.ok) {
    if (!run.failedSteps) {
      run.failedSteps = [];
    }
    run.failedSteps.push(result.name);
  }
}

/**
 * 実行を完了
 */
export function finishRun(
  runId: string,
  ok: boolean,
  errorMessage?: string
): WeeklyOpsRun | undefined {
  const run = weeklyOpsRuns.find((r) => r.id === runId);
  if (!run) return undefined;

  run.finishedAt = new Date().toISOString();
  run.ok = ok;
  if (errorMessage) {
    run.errorMessage = errorMessage;
  }

  return run;
}

/**
 * IDで実行ログを取得
 */
export function getRunById(runId: string): WeeklyOpsRun | undefined {
  return weeklyOpsRuns.find((r) => r.id === runId);
}

/**
 * 週の開始日で実行ログを取得
 */
export function getRunByWeekStart(weekStart: string): WeeklyOpsRun | undefined {
  return weeklyOpsRuns.find((r) => r.weekStart === weekStart && r.ok);
}

/**
 * 今週既に成功している実行があるかどうか
 */
export function hasSuccessfulRunThisWeek(weekStart?: string): boolean {
  const targetWeek = weekStart ?? getWeekStartDate();
  return weeklyOpsRuns.some((r) => r.weekStart === targetWeek && r.ok && r.finishedAt);
}

/**
 * 最近の実行ログを取得
 */
export function listRecentRuns(limit: number = 10): WeeklyOpsRun[] {
  return [...weeklyOpsRuns]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

/**
 * 最新の実行ログを取得
 */
export function getLatestRun(): WeeklyOpsRun | undefined {
  const sorted = [...weeklyOpsRuns].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt)
  );
  return sorted[0];
}

/**
 * 最近失敗した実行があるかどうか
 */
export function hasFailedRecently(): boolean {
  const recent = listRecentRuns(5);
  return recent.some((r) => !r.ok);
}

/**
 * 失敗したステップ名を取得（最新の実行から）
 */
export function getRecentFailedSteps(): WeeklyOpsStepName[] {
  const latest = getLatestRun();
  if (!latest || latest.ok) return [];
  return latest.failedSteps ?? [];
}

/**
 * 実行統計を取得
 */
export function getRunStats(): {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
} {
  const total = weeklyOpsRuns.filter((r) => r.finishedAt).length;
  const success = weeklyOpsRuns.filter((r) => r.finishedAt && r.ok).length;
  const failed = total - success;
  const latest = getLatestRun();

  return {
    totalRuns: total,
    successRuns: success,
    failedRuns: failed,
    successRate: total > 0 ? Math.round((success / total) * 100) : 0,
    lastRunAt: latest?.finishedAt ?? latest?.startedAt ?? null,
    lastRunOk: latest?.ok ?? null,
  };
}

/**
 * 全実行ログをクリア（テスト用）
 */
export function clearAllRuns(): void {
  weeklyOpsRuns = [];
}
