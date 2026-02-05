/**
 * 週次オペレーション（Weekly Ops）モジュール
 *
 * Implementation Ticket 067: weekly-ops の本番運用固定
 */

// 型定義
export type {
  WeeklyOpsStepName,
  WeeklyOpsStepResult,
  WeeklyOpsRun,
  WeeklyOpsOptions,
  WeeklyOpsResult,
} from './types';

export { getWeekStartDate, generateWeeklyFingerprint } from './types';

// リポジトリ
export {
  startRun,
  addStepResult,
  finishRun,
  getRunById,
  getRunByWeekStart,
  hasSuccessfulRunThisWeek,
  listRecentRuns,
  getLatestRun,
  hasFailedRecently,
  getRecentFailedSteps,
  getRunStats,
  clearAllRuns,
} from './repo';

// 実行エンジン
export { executeWeeklyOps, previewWeeklyOps } from './executor';
