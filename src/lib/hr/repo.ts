/**
 * HR リポジトリ
 *
 * Ticket 110: HR 入退社基盤
 *
 * インメモリストレージ（本番ではFirestoreに置き換え）
 */

import type {
  HrEmployee,
  HrOffboardingTask,
  HrEvent,
  HrEventAction,
  EmploymentStatus,
  OffboardingTaskType,
  OffboardingTaskStatus,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  TerminateEmployeeRequest,
  CompleteOffboardingTaskRequest,
  HrStats,
} from './types';
import { OFFBOARDING_TASK_TYPE_CONFIG } from './types';

// ========== インメモリストレージ ==========

const employeesStore = new Map<string, HrEmployee>();
const offboardingTasksStore = new Map<string, HrOffboardingTask>();
const eventsStore: HrEvent[] = [];

// ID生成
let employeeIdCounter = 1;
let taskIdCounter = 1;
let eventIdCounter = 1;

function generateEmployeeId(): string {
  return `emp_${Date.now()}_${employeeIdCounter++}`;
}

function generateTaskId(): string {
  return `offtask_${Date.now()}_${taskIdCounter++}`;
}

function generateEventId(): string {
  return `hrevent_${Date.now()}_${eventIdCounter++}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ========== HRイベント記録 ==========

/**
 * HRイベントを記録
 */
export function recordHrEvent(
  userId: string,
  action: HrEventAction,
  actorUserId: string | null,
  meta?: Record<string, unknown>
): HrEvent {
  const event: HrEvent = {
    id: generateEventId(),
    userId,
    action,
    actorUserId,
    createdAt: nowIso(),
    meta: meta ?? null,
  };
  eventsStore.push(event);
  return event;
}

/**
 * HRイベントを取得
 */
export function getHrEvents(userId?: string, limit: number = 100): HrEvent[] {
  let events = [...eventsStore];
  if (userId) {
    events = events.filter((e) => e.userId === userId);
  }
  return events
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/**
 * 全HRイベントを取得（監査用）
 */
export function getAllHrEvents(limit: number = 1000): HrEvent[] {
  return [...eventsStore]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

// ========== 従業員 CRUD ==========

/**
 * 従業員を作成（入社手続き開始）
 */
export function createEmployee(
  request: CreateEmployeeRequest,
  actorUserId: string
): HrEmployee {
  const id = generateEmployeeId();
  const userId = request.userId || id;
  const now = nowIso();

  const employee: HrEmployee = {
    id,
    userId,
    displayName: request.displayName,
    email: request.email,
    role: request.role,
    orgUnitIds: request.orgUnitIds ?? [],
    primaryOrgUnitId: request.primaryOrgUnitId ?? null,
    businessUnitId: request.businessUnitId ?? null,
    employmentStatus: 'prehire',
    hireDate: request.hireDate,
    terminationDate: null,
    terminationReason: null,
    onboardingStatus: null,
    lastUpdatedAt: now,
    createdAt: now,
  };

  employeesStore.set(id, employee);

  // イベント記録
  recordHrEvent(userId, 'hire_initiated', actorUserId, {
    displayName: request.displayName,
    email: request.email,
    role: request.role,
    hireDate: request.hireDate,
  });

  return employee;
}

/**
 * 従業員を取得（ID）
 */
export function getEmployeeById(id: string): HrEmployee | null {
  return employeesStore.get(id) ?? null;
}

/**
 * 従業員を取得（userId）
 */
export function getEmployeeByUserId(userId: string): HrEmployee | null {
  for (const emp of employeesStore.values()) {
    if (emp.userId === userId) return emp;
  }
  return null;
}

/**
 * 従業員一覧を取得
 */
export function listEmployees(options?: {
  status?: EmploymentStatus;
  onboardingStatus?: 'pending' | 'completed';
  businessUnitId?: string;
  limit?: number;
  offset?: number;
}): { employees: HrEmployee[]; total: number } {
  let employees = Array.from(employeesStore.values());

  // フィルタリング
  if (options?.status) {
    employees = employees.filter((e) => e.employmentStatus === options.status);
  }
  if (options?.onboardingStatus) {
    employees = employees.filter((e) => e.onboardingStatus === options.onboardingStatus);
  }
  if (options?.businessUnitId) {
    employees = employees.filter((e) => e.businessUnitId === options.businessUnitId);
  }

  // ソート（入社日順）
  employees.sort((a, b) => new Date(b.hireDate).getTime() - new Date(a.hireDate).getTime());

  const total = employees.length;
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;
  employees = employees.slice(offset, offset + limit);

  return { employees, total };
}

/**
 * 従業員を更新
 */
export function updateEmployee(
  id: string,
  request: UpdateEmployeeRequest,
  actorUserId: string
): HrEmployee | null {
  const employee = employeesStore.get(id);
  if (!employee) return null;

  const oldRole = employee.role;
  const oldOrgUnitIds = employee.orgUnitIds;
  const oldStatus = employee.employmentStatus;

  // 更新
  if (request.displayName !== undefined) employee.displayName = request.displayName;
  if (request.email !== undefined) employee.email = request.email;
  if (request.role !== undefined) employee.role = request.role;
  if (request.orgUnitIds !== undefined) employee.orgUnitIds = request.orgUnitIds;
  if (request.primaryOrgUnitId !== undefined) employee.primaryOrgUnitId = request.primaryOrgUnitId;
  if (request.businessUnitId !== undefined) employee.businessUnitId = request.businessUnitId;
  if (request.employmentStatus !== undefined) employee.employmentStatus = request.employmentStatus;
  if (request.hireDate !== undefined) employee.hireDate = request.hireDate;
  employee.lastUpdatedAt = nowIso();

  employeesStore.set(id, employee);

  // イベント記録
  if (request.role !== undefined && request.role !== oldRole) {
    recordHrEvent(employee.userId, 'role_changed', actorUserId, {
      fromRole: oldRole,
      toRole: request.role,
    });
  }
  if (request.orgUnitIds !== undefined && JSON.stringify(request.orgUnitIds) !== JSON.stringify(oldOrgUnitIds)) {
    recordHrEvent(employee.userId, 'orgunit_changed', actorUserId, {
      fromOrgUnitIds: oldOrgUnitIds,
      toOrgUnitIds: request.orgUnitIds,
    });
  }
  if (request.employmentStatus !== undefined && request.employmentStatus !== oldStatus) {
    if (request.employmentStatus === 'active') {
      recordHrEvent(employee.userId, 'activated', actorUserId);
    } else if (request.employmentStatus === 'leave') {
      recordHrEvent(employee.userId, 'leave_started', actorUserId);
    }
  }

  return employee;
}

/**
 * 従業員をactive状態に更新
 */
export function activateEmployee(id: string, actorUserId: string): HrEmployee | null {
  return updateEmployee(id, { employmentStatus: 'active' }, actorUserId);
}

/**
 * オンボーディングステータスを同期
 */
export function syncOnboardingStatus(
  userId: string,
  status: 'pending' | 'completed'
): HrEmployee | null {
  const employee = getEmployeeByUserId(userId);
  if (!employee) return null;

  employee.onboardingStatus = status;
  employee.lastUpdatedAt = nowIso();

  // completed になったら employmentStatus を active に自動更新
  if (status === 'completed' && employee.employmentStatus === 'prehire') {
    employee.employmentStatus = 'active';
    recordHrEvent(userId, 'activated', null, {
      trigger: 'onboarding_completed',
    });
  }

  employeesStore.set(employee.id, employee);
  return employee;
}

// ========== 退社処理 ==========

/**
 * 退社処理を開始
 */
export function terminateEmployee(
  id: string,
  request: TerminateEmployeeRequest,
  actorUserId: string
): { employee: HrEmployee; tasks: HrOffboardingTask[] } | null {
  const employee = employeesStore.get(id);
  if (!employee) return null;

  // ステータス変更
  employee.employmentStatus = 'terminated';
  employee.terminationDate = request.terminationDate;
  employee.terminationReason = request.terminationReason ?? null;
  employee.lastUpdatedAt = nowIso();

  employeesStore.set(id, employee);

  // イベント記録
  recordHrEvent(employee.userId, 'terminated', actorUserId, {
    terminationDate: request.terminationDate,
    terminationReason: request.terminationReason,
  });

  // オフボーディングタスク生成
  const tasks: HrOffboardingTask[] = [];
  if (request.generateOffboardingTasks !== false) {
    const taskTypes: OffboardingTaskType[] = [
      'disable_account',
      'revoke_permissions',
      'revoke_external_access',
      'collect_devices',
      'export_audit',
      'archive_documents',
    ];

    for (const taskType of taskTypes) {
      const task = createOffboardingTask(employee.userId, taskType, request.terminationDate);
      tasks.push(task);
    }

    recordHrEvent(employee.userId, 'offboarding_started', actorUserId, {
      taskCount: tasks.length,
    });
  }

  return { employee, tasks };
}

// ========== オフボーディングタスク ==========

/**
 * オフボーディングタスクを作成
 */
export function createOffboardingTask(
  userId: string,
  taskType: OffboardingTaskType,
  terminationDate: string
): HrOffboardingTask {
  const now = nowIso();
  const config = OFFBOARDING_TASK_TYPE_CONFIG[taskType];

  // 優先度に応じて期限を設定
  const dueDate = new Date(terminationDate);
  dueDate.setDate(dueDate.getDate() + config.priority);

  const task: HrOffboardingTask = {
    id: generateTaskId(),
    userId,
    status: 'open',
    taskType,
    dueAt: dueDate.toISOString(),
    doneAt: null,
    doneByUserId: null,
    note: null,
    createdAt: now,
  };

  offboardingTasksStore.set(task.id, task);
  return task;
}

/**
 * オフボーディングタスクを取得
 */
export function getOffboardingTask(id: string): HrOffboardingTask | null {
  return offboardingTasksStore.get(id) ?? null;
}

/**
 * ユーザーのオフボーディングタスク一覧を取得
 */
export function listOffboardingTasks(options?: {
  userId?: string;
  status?: OffboardingTaskStatus;
  limit?: number;
}): HrOffboardingTask[] {
  let tasks = Array.from(offboardingTasksStore.values());

  if (options?.userId) {
    tasks = tasks.filter((t) => t.userId === options.userId);
  }
  if (options?.status) {
    tasks = tasks.filter((t) => t.status === options.status);
  }

  // 優先度順にソート
  tasks.sort((a, b) => {
    const priorityA = OFFBOARDING_TASK_TYPE_CONFIG[a.taskType].priority;
    const priorityB = OFFBOARDING_TASK_TYPE_CONFIG[b.taskType].priority;
    return priorityA - priorityB;
  });

  return tasks.slice(0, options?.limit ?? 100);
}

/**
 * オフボーディングタスクを完了
 */
export function completeOffboardingTask(
  id: string,
  request: CompleteOffboardingTaskRequest,
  actorUserId: string
): HrOffboardingTask | null {
  const task = offboardingTasksStore.get(id);
  if (!task) return null;

  task.status = 'done';
  task.doneAt = nowIso();
  task.doneByUserId = actorUserId;
  task.note = request.note ?? null;

  offboardingTasksStore.set(id, task);

  // イベント記録
  recordHrEvent(task.userId, 'offboarding_task_done', actorUserId, {
    taskType: task.taskType,
    taskId: task.id,
  });

  // 全タスク完了チェック
  const userTasks = listOffboardingTasks({ userId: task.userId });
  const allDone = userTasks.every((t) => t.status === 'done');
  if (allDone) {
    recordHrEvent(task.userId, 'offboarding_completed', actorUserId);
  }

  return task;
}

/**
 * 期限超過のオフボーディングタスクを取得
 */
export function getOverdueOffboardingTasks(): HrOffboardingTask[] {
  const now = new Date();
  return Array.from(offboardingTasksStore.values()).filter(
    (t) => t.status === 'open' && new Date(t.dueAt) < now
  );
}

// ========== 統計 ==========

/**
 * HR統計を取得
 */
export function getHrStats(): HrStats {
  const employees = Array.from(employeesStore.values());
  const tasks = Array.from(offboardingTasksStore.values());

  return {
    totalEmployees: employees.length,
    prehire: employees.filter((e) => e.employmentStatus === 'prehire').length,
    active: employees.filter((e) => e.employmentStatus === 'active').length,
    leave: employees.filter((e) => e.employmentStatus === 'leave').length,
    terminated: employees.filter((e) => e.employmentStatus === 'terminated').length,
    pendingOnboarding: employees.filter((e) => e.onboardingStatus === 'pending').length,
    openOffboardingTasks: tasks.filter((t) => t.status === 'open').length,
  };
}

// ========== テスト用 ==========

/**
 * ストアをクリア（テスト用）
 */
export function clearAllHrData(): void {
  employeesStore.clear();
  offboardingTasksStore.clear();
  eventsStore.length = 0;
}

// ========== 初期データ ==========

/**
 * サンプルデータを投入
 */
export function seedSampleData(): void {
  // サンプル従業員
  createEmployee(
    {
      userId: 'user_001',
      displayName: '山田太郎',
      email: 'yamada@example.com',
      role: 'staff',
      hireDate: '2024-04-01',
      businessUnitId: 'bu_housing_1',
    },
    'system'
  );

  createEmployee(
    {
      userId: 'user_002',
      displayName: '鈴木花子',
      email: 'suzuki@example.com',
      role: 'leader',
      hireDate: '2024-01-15',
      businessUnitId: 'bu_nursing_1',
    },
    'system'
  );

  // 入社予定者
  createEmployee(
    {
      userId: 'user_003',
      displayName: '田中一郎',
      email: 'tanaka@example.com',
      role: 'staff',
      hireDate: '2026-03-01',
      businessUnitId: 'bu_housing_1',
    },
    'system'
  );
}
