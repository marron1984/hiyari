/**
 * HR リポジトリ - Firestore実装
 *
 * Ticket 110: HR 入退社基盤
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション:
 * - hr_employees: 従業員レコード
 * - hr_offboarding_tasks: オフボーディングタスク
 * - hr_events: HRイベント（監査ログ）
 */

import { getAdminDb } from '@/lib/firebase-admin';
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

// ========== 定数 ==========

const EMPLOYEES_COLLECTION = 'hr_employees';
const OFFBOARDING_TASKS_COLLECTION = 'hr_offboarding_tasks';
const EVENTS_COLLECTION = 'hr_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== ドキュメント変換 ==========

function docToEmployee(doc: FirebaseFirestore.DocumentSnapshot): HrEmployee | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    userId: data.userId ?? '',
    displayName: data.displayName ?? '',
    email: data.email ?? '',
    role: data.role ?? 'staff',
    orgUnitIds: data.orgUnitIds ?? [],
    primaryOrgUnitId: data.primaryOrgUnitId ?? null,
    businessUnitId: data.businessUnitId ?? null,
    employmentStatus: data.employmentStatus ?? 'prehire',
    hireDate: data.hireDate ?? '',
    terminationDate: data.terminationDate ?? null,
    terminationReason: data.terminationReason ?? null,
    onboardingStatus: data.onboardingStatus ?? null,
    lastUpdatedAt: data.lastUpdatedAt ?? now(),
    createdAt: data.createdAt ?? now(),
  };
}

function docToOffboardingTask(doc: FirebaseFirestore.DocumentSnapshot): HrOffboardingTask | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    userId: data.userId ?? '',
    status: data.status ?? 'open',
    taskType: data.taskType ?? 'disable_account',
    dueAt: data.dueAt ?? now(),
    doneAt: data.doneAt ?? null,
    doneByUserId: data.doneByUserId ?? null,
    note: data.note ?? null,
    createdAt: data.createdAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): HrEvent | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    userId: data.userId ?? '',
    action: data.action ?? 'hire_initiated',
    actorUserId: data.actorUserId ?? null,
    createdAt: data.createdAt ?? now(),
    meta: data.meta ?? null,
  };
}

// ========== HRイベント記録 ==========

/**
 * HRイベントを記録
 */
export async function recordHrEvent(
  userId: string,
  action: HrEventAction,
  actorUserId: string | null,
  meta?: Record<string, unknown>
): Promise<HrEvent> {
  const db = getAdminDb();
  const event: HrEvent = {
    id: generateId('hrevent'),
    userId,
    action,
    actorUserId,
    createdAt: now(),
    meta: meta ?? null,
  };
  await db.collection(EVENTS_COLLECTION).doc(event.id).set(event);
  return event;
}

/**
 * HRイベントを取得
 */
export async function getHrEvents(userId?: string, limit: number = 100): Promise<HrEvent[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db
    .collection(EVENTS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  if (userId) {
    query = db
      .collection(EVENTS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => docToEvent(doc)!);
}

/**
 * 全HRイベントを取得（監査用）
 */
export async function getAllHrEvents(limit: number = 1000): Promise<HrEvent[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(EVENTS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((doc) => docToEvent(doc)!);
}

// ========== 従業員 CRUD ==========

/**
 * 従業員を作成（入社手続き開始）
 */
export async function createEmployee(
  request: CreateEmployeeRequest,
  actorUserId: string
): Promise<HrEmployee> {
  const db = getAdminDb();
  const id = generateId('emp');
  const userId = request.userId || id;
  const timestamp = now();

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
    lastUpdatedAt: timestamp,
    createdAt: timestamp,
  };

  await db.collection(EMPLOYEES_COLLECTION).doc(id).set(employee);

  // イベント記録
  await recordHrEvent(userId, 'hire_initiated', actorUserId, {
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
export async function getEmployeeById(id: string): Promise<HrEmployee | null> {
  const db = getAdminDb();
  const doc = await db.collection(EMPLOYEES_COLLECTION).doc(id).get();
  return docToEmployee(doc);
}

/**
 * 従業員を取得（userId）
 */
export async function getEmployeeByUserId(userId: string): Promise<HrEmployee | null> {
  const db = getAdminDb();
  const snap = await db
    .collection(EMPLOYEES_COLLECTION)
    .where('userId', '==', userId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return docToEmployee(snap.docs[0]);
}

/**
 * 従業員一覧を取得
 */
export async function listEmployees(options?: {
  status?: EmploymentStatus;
  onboardingStatus?: 'pending' | 'completed';
  businessUnitId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ employees: HrEmployee[]; total: number }> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(EMPLOYEES_COLLECTION);

  if (options?.status) {
    query = query.where('employmentStatus', '==', options.status);
  }
  if (options?.businessUnitId) {
    query = query.where('businessUnitId', '==', options.businessUnitId);
  }

  const snap = await query.get();
  let employees = snap.docs.map((doc) => docToEmployee(doc)!);

  // 追加フィルタ（Firestoreの複合クエリ制限を回避）
  if (options?.onboardingStatus) {
    employees = employees.filter((e) => e.onboardingStatus === options.onboardingStatus);
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
export async function updateEmployee(
  id: string,
  request: UpdateEmployeeRequest,
  actorUserId: string
): Promise<HrEmployee | null> {
  const db = getAdminDb();
  const docRef = db.collection(EMPLOYEES_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const employee = docToEmployee(doc)!;
  const oldRole = employee.role;
  const oldOrgUnitIds = employee.orgUnitIds;
  const oldStatus = employee.employmentStatus;

  // 更新
  const patch: Record<string, unknown> = { lastUpdatedAt: now() };
  if (request.displayName !== undefined) { employee.displayName = request.displayName; patch.displayName = request.displayName; }
  if (request.email !== undefined) { employee.email = request.email; patch.email = request.email; }
  if (request.role !== undefined) { employee.role = request.role; patch.role = request.role; }
  if (request.orgUnitIds !== undefined) { employee.orgUnitIds = request.orgUnitIds; patch.orgUnitIds = request.orgUnitIds; }
  if (request.primaryOrgUnitId !== undefined) { employee.primaryOrgUnitId = request.primaryOrgUnitId; patch.primaryOrgUnitId = request.primaryOrgUnitId; }
  if (request.businessUnitId !== undefined) { employee.businessUnitId = request.businessUnitId; patch.businessUnitId = request.businessUnitId; }
  if (request.employmentStatus !== undefined) { employee.employmentStatus = request.employmentStatus; patch.employmentStatus = request.employmentStatus; }
  if (request.hireDate !== undefined) { employee.hireDate = request.hireDate; patch.hireDate = request.hireDate; }

  await docRef.update(patch);

  // イベント記録
  if (request.role !== undefined && request.role !== oldRole) {
    await recordHrEvent(employee.userId, 'role_changed', actorUserId, {
      fromRole: oldRole,
      toRole: request.role,
    });
  }
  if (request.orgUnitIds !== undefined && JSON.stringify(request.orgUnitIds) !== JSON.stringify(oldOrgUnitIds)) {
    await recordHrEvent(employee.userId, 'orgunit_changed', actorUserId, {
      fromOrgUnitIds: oldOrgUnitIds,
      toOrgUnitIds: request.orgUnitIds,
    });
  }
  if (request.employmentStatus !== undefined && request.employmentStatus !== oldStatus) {
    if (request.employmentStatus === 'active') {
      await recordHrEvent(employee.userId, 'activated', actorUserId);
    } else if (request.employmentStatus === 'leave') {
      await recordHrEvent(employee.userId, 'leave_started', actorUserId);
    }
  }

  return employee;
}

/**
 * 従業員をactive状態に更新
 */
export async function activateEmployee(id: string, actorUserId: string): Promise<HrEmployee | null> {
  return updateEmployee(id, { employmentStatus: 'active' }, actorUserId);
}

/**
 * オンボーディングステータスを同期
 */
export async function syncOnboardingStatus(
  userId: string,
  status: 'pending' | 'completed'
): Promise<HrEmployee | null> {
  const employee = await getEmployeeByUserId(userId);
  if (!employee) return null;

  const db = getAdminDb();
  const docRef = db.collection(EMPLOYEES_COLLECTION).doc(employee.id);

  const patch: Record<string, unknown> = {
    onboardingStatus: status,
    lastUpdatedAt: now(),
  };

  // completed になったら employmentStatus を active に自動更新
  if (status === 'completed' && employee.employmentStatus === 'prehire') {
    patch.employmentStatus = 'active';
    employee.employmentStatus = 'active';
    await recordHrEvent(userId, 'activated', null, {
      trigger: 'onboarding_completed',
    });
  }

  employee.onboardingStatus = status;
  await docRef.update(patch);

  return employee;
}

// ========== 退社処理 ==========

/**
 * 退社処理を開始
 */
export async function terminateEmployee(
  id: string,
  request: TerminateEmployeeRequest,
  actorUserId: string
): Promise<{ employee: HrEmployee; tasks: HrOffboardingTask[] } | null> {
  const db = getAdminDb();
  const docRef = db.collection(EMPLOYEES_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const employee = docToEmployee(doc)!;

  // ステータス変更
  employee.employmentStatus = 'terminated';
  employee.terminationDate = request.terminationDate;
  employee.terminationReason = request.terminationReason ?? null;
  employee.lastUpdatedAt = now();

  await docRef.update({
    employmentStatus: 'terminated',
    terminationDate: request.terminationDate,
    terminationReason: request.terminationReason ?? null,
    lastUpdatedAt: now(),
  });

  // イベント記録
  await recordHrEvent(employee.userId, 'terminated', actorUserId, {
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
      const task = await createOffboardingTask(employee.userId, taskType, request.terminationDate);
      tasks.push(task);
    }

    await recordHrEvent(employee.userId, 'offboarding_started', actorUserId, {
      taskCount: tasks.length,
    });
  }

  return { employee, tasks };
}

// ========== オフボーディングタスク ==========

/**
 * オフボーディングタスクを作成
 */
export async function createOffboardingTask(
  userId: string,
  taskType: OffboardingTaskType,
  terminationDate: string
): Promise<HrOffboardingTask> {
  const db = getAdminDb();
  const timestamp = now();
  const config = OFFBOARDING_TASK_TYPE_CONFIG[taskType];

  // 優先度に応じて期限を設定
  const dueDate = new Date(terminationDate);
  dueDate.setDate(dueDate.getDate() + config.priority);

  const task: HrOffboardingTask = {
    id: generateId('offtask'),
    userId,
    status: 'open',
    taskType,
    dueAt: dueDate.toISOString(),
    doneAt: null,
    doneByUserId: null,
    note: null,
    createdAt: timestamp,
  };

  await db.collection(OFFBOARDING_TASKS_COLLECTION).doc(task.id).set(task);
  return task;
}

/**
 * オフボーディングタスクを取得
 */
export async function getOffboardingTask(id: string): Promise<HrOffboardingTask | null> {
  const db = getAdminDb();
  const doc = await db.collection(OFFBOARDING_TASKS_COLLECTION).doc(id).get();
  return docToOffboardingTask(doc);
}

/**
 * ユーザーのオフボーディングタスク一覧を取得
 */
export async function listOffboardingTasks(options?: {
  userId?: string;
  status?: OffboardingTaskStatus;
  limit?: number;
}): Promise<HrOffboardingTask[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(OFFBOARDING_TASKS_COLLECTION);

  if (options?.userId) {
    query = query.where('userId', '==', options.userId);
  }
  if (options?.status) {
    query = query.where('status', '==', options.status);
  }

  const snap = await query.get();
  let tasks = snap.docs.map((doc) => docToOffboardingTask(doc)!);

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
export async function completeOffboardingTask(
  id: string,
  request: CompleteOffboardingTaskRequest,
  actorUserId: string
): Promise<HrOffboardingTask | null> {
  const db = getAdminDb();
  const docRef = db.collection(OFFBOARDING_TASKS_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const task = docToOffboardingTask(doc)!;

  const timestamp = now();
  await docRef.update({
    status: 'done',
    doneAt: timestamp,
    doneByUserId: actorUserId,
    note: request.note ?? null,
  });

  task.status = 'done';
  task.doneAt = timestamp;
  task.doneByUserId = actorUserId;
  task.note = request.note ?? null;

  // イベント記録
  await recordHrEvent(task.userId, 'offboarding_task_done', actorUserId, {
    taskType: task.taskType,
    taskId: task.id,
  });

  // 全タスク完了チェック
  const userTasks = await listOffboardingTasks({ userId: task.userId });
  const allDone = userTasks.every((t) => t.status === 'done');
  if (allDone) {
    await recordHrEvent(task.userId, 'offboarding_completed', actorUserId);
  }

  return task;
}

/**
 * 期限超過のオフボーディングタスクを取得
 */
export async function getOverdueOffboardingTasks(): Promise<HrOffboardingTask[]> {
  const db = getAdminDb();
  const currentTime = now();
  const snap = await db
    .collection(OFFBOARDING_TASKS_COLLECTION)
    .where('status', '==', 'open')
    .get();

  return snap.docs
    .map((doc) => docToOffboardingTask(doc)!)
    .filter((t) => t.dueAt < currentTime);
}

// ========== 統計 ==========

/**
 * HR統計を取得
 */
export async function getHrStats(): Promise<HrStats> {
  const db = getAdminDb();

  const [employeesSnap, tasksSnap] = await Promise.all([
    db.collection(EMPLOYEES_COLLECTION).get(),
    db.collection(OFFBOARDING_TASKS_COLLECTION).where('status', '==', 'open').get(),
  ]);

  const employees = employeesSnap.docs.map((doc) => docToEmployee(doc)!);

  return {
    totalEmployees: employees.length,
    prehire: employees.filter((e) => e.employmentStatus === 'prehire').length,
    active: employees.filter((e) => e.employmentStatus === 'active').length,
    leave: employees.filter((e) => e.employmentStatus === 'leave').length,
    terminated: employees.filter((e) => e.employmentStatus === 'terminated').length,
    pendingOnboarding: employees.filter((e) => e.onboardingStatus === 'pending').length,
    openOffboardingTasks: tasksSnap.size,
  };
}

// ========== テスト用 ==========

/**
 * ストアをクリア（テスト用）
 */
export async function clearAllHrData(): Promise<void> {
  // Firestore版では no-op（テスト環境ではFirestoreエミュレータを使用）
  console.warn('[HR:Firestore] clearAllHrData is a no-op in Firestore mode');
}

/**
 * サンプルデータを投入
 */
export async function seedSampleData(): Promise<void> {
  // Firestore版では no-op（データはFirestoreに直接投入）
  console.warn('[HR:Firestore] seedSampleData is a no-op in Firestore mode');
}
