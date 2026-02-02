/**
 * 日次オペレーション実行ログリポジトリ
 *
 * Implementation Ticket 045: 監視＆滞留防止の自動運用
 */

import type { DailyOpsRun, DailyOpsStepResult } from './types';

// ========== インメモリストレージ ==========

const runsStore = new Map<string, DailyOpsRun>();

let runIdCounter = 1;

function generateRunId(): string {
  return `daily_ops_${Date.now()}_${runIdCounter++}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== CRUD操作 ==========

/**
 * 新しい実行を開始
 */
export function startRun(date: string): DailyOpsRun {
  const run: DailyOpsRun = {
    id: generateRunId(),
    date,
    startedAt: now(),
    finishedAt: null,
    ok: false,
    steps: [],
    totalAlertsCreated: 0,
    totalAlertsSkipped: 0,
    totalNotifications: 0,
  };
  runsStore.set(run.id, run);
  return run;
}

/**
 * ステップ結果を追加
 */
export function addStepResult(runId: string, step: DailyOpsStepResult): void {
  const run = runsStore.get(runId);
  if (!run) return;

  run.steps.push(step);
  run.totalAlertsCreated += step.alertsCreated;
  run.totalAlertsSkipped += step.alertsSkipped;
  run.totalNotifications += step.notificationsCreated;
}

/**
 * 実行を完了
 */
export function finishRun(runId: string, ok: boolean, errorMessage?: string): DailyOpsRun | null {
  const run = runsStore.get(runId);
  if (!run) return null;

  run.finishedAt = now();
  run.ok = ok;
  if (errorMessage) {
    run.errorMessage = errorMessage;
  }

  return run;
}

/**
 * 実行を取得
 */
export function getRunById(id: string): DailyOpsRun | null {
  return runsStore.get(id) ?? null;
}

/**
 * 日付で実行を取得
 */
export function getRunByDate(date: string): DailyOpsRun | null {
  for (const run of runsStore.values()) {
    if (run.date === date && run.ok) {
      return run;
    }
  }
  return null;
}

/**
 * 同日に成功した実行があるかチェック
 */
export function hasSuccessfulRunToday(date: string): boolean {
  for (const run of runsStore.values()) {
    if (run.date === date && run.ok) {
      return true;
    }
  }
  return false;
}

/**
 * 最近の実行履歴を取得
 */
export function listRecentRuns(limit: number = 30): DailyOpsRun[] {
  return Array.from(runsStore.values())
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

/**
 * 統計を取得
 */
export function getRunStats(): {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastSuccessfulRun: DailyOpsRun | null;
  lastFailedRun: DailyOpsRun | null;
} {
  const runs = Array.from(runsStore.values());
  const successful = runs.filter((r) => r.ok);
  const failed = runs.filter((r) => !r.ok && r.finishedAt);

  return {
    totalRuns: runs.length,
    successfulRuns: successful.length,
    failedRuns: failed.length,
    lastSuccessfulRun: successful.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )[0] ?? null,
    lastFailedRun: failed.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )[0] ?? null,
  };
}

/**
 * テスト用: すべての実行をクリア
 */
export function clearAllRuns(): void {
  runsStore.clear();
  runIdCounter = 1;
}
