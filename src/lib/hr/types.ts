/**
 * HR 入退社基盤 型定義
 *
 * Ticket 110: HR 入退社基盤（入社→アカウント→署名→研修→権限 / 退社→停止→回収）
 *
 * - 入社/退社を台帳化し、手続き漏れをゼロにする
 * - 既存のオンボーディング（093-100）と完全連動
 * - 退社時の権限停止・アクセス遮断・証跡回収を自動化
 */

import type { AppRole } from '@/config/appRoles';
import type { UserOnboardingStatus } from '@/lib/onboarding/types';

// ========== 雇用ステータス ==========

/**
 * 雇用ステータス
 */
export type EmploymentStatus =
  | 'prehire'     // 入社予定
  | 'active'      // 在籍中
  | 'leave'       // 休職中
  | 'terminated'; // 退社済

export const EMPLOYMENT_STATUS_CONFIG: Record<EmploymentStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  prehire: { label: '入社予定', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  active: { label: '在籍中', color: 'text-green-700', bgColor: 'bg-green-100' },
  leave: { label: '休職中', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  terminated: { label: '退社済', color: 'text-gray-700', bgColor: 'bg-gray-100' },
};

// ========== 従業員 ==========

/**
 * 従業員レコード（hr_employees）
 */
export interface HrEmployee {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: AppRole;
  orgUnitIds: string[];
  primaryOrgUnitId: string | null;
  businessUnitId: string | null;
  employmentStatus: EmploymentStatus;
  hireDate: string;  // YYYY-MM-DD
  terminationDate: string | null;
  terminationReason: string | null;
  /** オンボーディングステータス（mirror from onboarding） */
  onboardingStatus: UserOnboardingStatus | null;
  lastUpdatedAt: string;
  createdAt: string;
}

// ========== オフボーディングタスク ==========

/**
 * オフボーディングタスク種別
 */
export type OffboardingTaskType =
  | 'disable_account'       // アカウント無効化（最優先）
  | 'revoke_permissions'    // 権限剥奪（roleをdisabledへ）
  | 'revoke_external_access'// 外部アクセス無効化
  | 'collect_devices'       // 端末回収
  | 'export_audit'          // 監査ログエクスポート
  | 'archive_documents';    // ドキュメントアーカイブ

export const OFFBOARDING_TASK_TYPE_CONFIG: Record<OffboardingTaskType, {
  label: string;
  priority: number;  // 小さいほど優先
  description: string;
}> = {
  disable_account: {
    label: 'アカウント無効化',
    priority: 1,
    description: 'ログインを即座に停止する',
  },
  revoke_permissions: {
    label: '権限剥奪',
    priority: 2,
    description: 'ロールを無効化し、全機能へのアクセスを遮断',
  },
  revoke_external_access: {
    label: '外部アクセス無効化',
    priority: 3,
    description: '外部共有アカウントがあれば無効化',
  },
  collect_devices: {
    label: '端末回収',
    priority: 4,
    description: '貸与端末・備品の回収',
  },
  export_audit: {
    label: '監査ログエクスポート',
    priority: 5,
    description: '退職者の操作ログをエクスポート',
  },
  archive_documents: {
    label: 'ドキュメントアーカイブ',
    priority: 6,
    description: '関連文書のアーカイブ',
  },
};

/**
 * オフボーディングタスクステータス
 */
export type OffboardingTaskStatus = 'open' | 'done';

/**
 * オフボーディングタスク（hr_offboarding_tasks）
 */
export interface HrOffboardingTask {
  id: string;
  userId: string;
  status: OffboardingTaskStatus;
  taskType: OffboardingTaskType;
  dueAt: string;
  doneAt: string | null;
  doneByUserId: string | null;
  note: string | null;
  createdAt: string;
}

// ========== HRイベント（監査） ==========

/**
 * HRイベントアクション
 */
export type HrEventAction =
  | 'hire_initiated'       // 入社手続き開始
  | 'activated'            // active に変更
  | 'leave_started'        // 休職開始
  | 'leave_ended'          // 休職終了
  | 'terminated'           // 退社処理
  | 'offboarding_started'  // オフボーディング開始
  | 'offboarding_task_done'// オフボーディングタスク完了
  | 'offboarding_completed'// オフボーディング完了
  | 'role_changed'         // ロール変更
  | 'orgunit_changed';     // 組織変更

/**
 * HRイベント（hr_events）
 */
export interface HrEvent {
  id: string;
  userId: string;
  action: HrEventAction;
  actorUserId: string | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
}

// ========== リクエスト型 ==========

/**
 * 従業員登録リクエスト
 */
export interface CreateEmployeeRequest {
  userId?: string;  // 省略時は自動生成
  displayName: string;
  email: string;
  role: AppRole;
  orgUnitIds?: string[];
  primaryOrgUnitId?: string | null;
  businessUnitId?: string | null;
  hireDate: string;  // YYYY-MM-DD
}

/**
 * 従業員更新リクエスト
 */
export interface UpdateEmployeeRequest {
  displayName?: string;
  email?: string;
  role?: AppRole;
  orgUnitIds?: string[];
  primaryOrgUnitId?: string | null;
  businessUnitId?: string | null;
  employmentStatus?: EmploymentStatus;
  hireDate?: string;
}

/**
 * 退社処理リクエスト
 */
export interface TerminateEmployeeRequest {
  terminationDate: string;  // YYYY-MM-DD
  terminationReason?: string;
  generateOffboardingTasks?: boolean;  // default: true
}

/**
 * オフボーディングタスク完了リクエスト
 */
export interface CompleteOffboardingTaskRequest {
  note?: string;
}

// ========== 統計 ==========

/**
 * HR統計
 */
export interface HrStats {
  totalEmployees: number;
  prehire: number;
  active: number;
  leave: number;
  terminated: number;
  pendingOnboarding: number;
  openOffboardingTasks: number;
}

// ========== RBAC ==========

/**
 * HR管理権限を持つか
 */
export function canManageHr(role: AppRole): boolean {
  return ['admin', 'manager'].includes(role);
}

/**
 * HR閲覧権限を持つか
 */
export function canViewHr(role: AppRole): boolean {
  return ['admin', 'manager', 'executive', 'auditor'].includes(role);
}

/**
 * アクセス遮断対象か（terminated の場合）
 */
export function isAccessBlocked(status: EmploymentStatus): boolean {
  return status === 'terminated';
}

// ========== フィンガープリント ==========

/**
 * HR通知のフィンガープリント生成
 */
export function generateHrNotificationFingerprint(
  type: 'offboarding_started' | 'offboarding_overdue',
  userId: string,
  date: string
): string {
  return `notif:hr:${type}:${userId}:${date}`;
}
