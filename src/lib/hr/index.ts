/**
 * HR 入退社基盤モジュール
 *
 * Ticket 110: HR 入退社基盤
 */

// 型定義
export type {
  EmploymentStatus,
  HrEmployee,
  OffboardingTaskType,
  OffboardingTaskStatus,
  HrOffboardingTask,
  HrEventAction,
  HrEvent,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  TerminateEmployeeRequest,
  CompleteOffboardingTaskRequest,
  HrStats,
} from './types';

export {
  EMPLOYMENT_STATUS_CONFIG,
  OFFBOARDING_TASK_TYPE_CONFIG,
  canManageHr,
  canViewHr,
  isAccessBlocked,
  generateHrNotificationFingerprint,
} from './types';

// アクセスガード
export { checkAccessBlockedGate, getAccessBlockedState } from './accessGuard';

// リポジトリ
export {
  // HRイベント
  recordHrEvent,
  getHrEvents,
  getAllHrEvents,
  // 従業員
  createEmployee,
  getEmployeeById,
  getEmployeeByUserId,
  listEmployees,
  updateEmployee,
  activateEmployee,
  syncOnboardingStatus,
  // 退社処理
  terminateEmployee,
  // オフボーディングタスク
  createOffboardingTask,
  getOffboardingTask,
  listOffboardingTasks,
  completeOffboardingTask,
  getOverdueOffboardingTasks,
  // 統計
  getHrStats,
  // テスト用
  clearAllHrData,
  seedSampleData,
} from './repo';
