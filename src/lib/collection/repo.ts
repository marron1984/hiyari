/**
 * 回収フロー（Collection Flow）リポジトリ
 *
 * 現状は in-memory ストレージ（将来 DB 置換）
 */

import type {
  CollectionFlowTemplate,
  CollectionFlowStep,
  ReceivableFlowAssignment,
  ReceivableFlowStepLog,
  CollectionEvent,
  CollectionSubjectType,
  CollectionActionType,
  ExpectedOutcome,
  StepSeverity,
  AssignmentStatus,
  StepLogStatus,
  StepOutcome,
  CollectionEntityType,
  CollectionEventAction,
  ViewerContext,
} from './types';
import { canViewCollectionFlow, addDays, isStepOverdue } from './types';

// Task 049: receivables のインポート（businessUnitId取得用）
import * as receivablesRepo from '@/lib/receivables/repo';

// ========== ストレージ ==========

const templatesStore = new Map<string, CollectionFlowTemplate>();
const stepsStore = new Map<string, CollectionFlowStep>();
const assignmentsStore = new Map<string, ReceivableFlowAssignment>();
const stepLogsStore = new Map<string, ReceivableFlowStepLog>();
const eventsStore = new Map<string, CollectionEvent>();

// ========== ユーティリティ ==========

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ========== 監査ログ記録 ==========

function logEvent(
  entityType: CollectionEntityType,
  entityId: string,
  actorUserId: string,
  action: CollectionEventAction,
  beforeData: unknown | null,
  afterData: unknown | null,
  note: string | null = null
): void {
  const event: CollectionEvent = {
    id: generateId('cevt'),
    entityType,
    entityId,
    actorUserId,
    action,
    beforeJson: beforeData ? JSON.stringify(beforeData) : null,
    afterJson: afterData ? JSON.stringify(afterData) : null,
    createdAt: now(),
    note,
  };
  eventsStore.set(event.id, event);
}

/**
 * 全督促イベント取得（監査ビュー用）
 * Ticket 064-final
 */
export function getAllCollectionEvents(limit: number = 1000): CollectionEvent[] {
  return Array.from(eventsStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

// ========== テンプレート CRUD ==========

export interface CreateTemplateInput {
  name: string;
  subjectType?: CollectionSubjectType;
  description?: string | null;
}

export function listTemplates(
  viewer: ViewerContext,
  activeOnly: boolean = false
): CollectionFlowTemplate[] {
  if (!canViewCollectionFlow(viewer.role)) {
    return [];
  }

  let items = Array.from(templatesStore.values());
  if (activeOnly) {
    items = items.filter((t) => t.isActive);
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

export function getTemplateById(id: string): CollectionFlowTemplate | null {
  return templatesStore.get(id) ?? null;
}

export function createTemplate(
  input: CreateTemplateInput,
  actorUserId: string
): CollectionFlowTemplate {
  const id = generateId('cftpl');
  const timestamp = now();

  const template: CollectionFlowTemplate = {
    id,
    name: input.name,
    subjectType: input.subjectType ?? null,
    description: input.description ?? null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdByUserId: actorUserId,
  };

  templatesStore.set(id, template);
  logEvent('template', id, actorUserId, 'create', null, template);

  return template;
}

export function updateTemplate(
  id: string,
  patch: Partial<CreateTemplateInput> & { isActive?: boolean },
  actorUserId: string
): CollectionFlowTemplate | null {
  const existing = templatesStore.get(id);
  if (!existing) return null;

  const updated: CollectionFlowTemplate = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };

  templatesStore.set(id, updated);
  logEvent('template', id, actorUserId, 'update', existing, updated);

  return updated;
}

// ========== ステップ CRUD ==========

export interface CreateStepInput {
  actionType: CollectionActionType;
  dueDaysAfterPrevious: number;
  messageTemplate?: string | null;
  expectedOutcome?: ExpectedOutcome;
  severity?: StepSeverity;
}

export function listStepsByTemplate(templateId: string): CollectionFlowStep[] {
  return Array.from(stepsStore.values())
    .filter((s) => s.templateId === templateId && s.isActive)
    .sort((a, b) => a.stepOrder - b.stepOrder);
}

export function getStepById(id: string): CollectionFlowStep | null {
  return stepsStore.get(id) ?? null;
}

export function createStep(
  templateId: string,
  input: CreateStepInput,
  actorUserId: string
): CollectionFlowStep {
  const id = generateId('cfstep');
  const timestamp = now();

  // 次のstepOrderを計算
  const existingSteps = listStepsByTemplate(templateId);
  const nextOrder = existingSteps.length > 0
    ? Math.max(...existingSteps.map((s) => s.stepOrder)) + 1
    : 1;

  const step: CollectionFlowStep = {
    id,
    templateId,
    stepOrder: nextOrder,
    actionType: input.actionType,
    dueDaysAfterPrevious: input.dueDaysAfterPrevious,
    messageTemplate: input.messageTemplate ?? null,
    expectedOutcome: input.expectedOutcome ?? null,
    severity: input.severity ?? 'info',
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  stepsStore.set(id, step);

  return step;
}

export function updateStep(
  id: string,
  patch: Partial<CreateStepInput> & { isActive?: boolean },
  actorUserId: string
): CollectionFlowStep | null {
  const existing = stepsStore.get(id);
  if (!existing) return null;

  const updated: CollectionFlowStep = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };

  stepsStore.set(id, updated);

  return updated;
}

export function reorderSteps(
  templateId: string,
  orderedStepIds: string[],
  actorUserId: string
): boolean {
  const steps = listStepsByTemplate(templateId);
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  let order = 1;
  for (const stepId of orderedStepIds) {
    const step = stepMap.get(stepId);
    if (step) {
      step.stepOrder = order;
      step.updatedAt = now();
      stepsStore.set(stepId, step);
      order++;
    }
  }

  return true;
}

// ========== フロー割当 ==========

export function getAssignmentByReceivableId(
  receivableId: string
): ReceivableFlowAssignment | null {
  return Array.from(assignmentsStore.values()).find(
    (a) => a.receivableId === receivableId
  ) ?? null;
}

export function assignFlow(
  receivableId: string,
  templateId: string,
  actorUserId: string,
  baseDate?: string
): ReceivableFlowAssignment | null {
  const template = getTemplateById(templateId);
  if (!template || !template.isActive) return null;

  const steps = listStepsByTemplate(templateId);
  if (steps.length === 0) return null;

  // 既存の割当があれば更新
  let existing = getAssignmentByReceivableId(receivableId);

  const timestamp = now();
  const assignmentId = existing?.id ?? generateId('cfasgn');

  const assignment: ReceivableFlowAssignment = {
    id: assignmentId,
    receivableId,
    templateId,
    assignedAt: timestamp,
    assignedByUserId: actorUserId,
    currentStepOrder: 1,
    status: 'active',
    updatedAt: timestamp,
  };

  assignmentsStore.set(assignmentId, assignment);

  // 既存のstep_logsを削除
  const existingLogs = Array.from(stepLogsStore.values()).filter(
    (l) => l.receivableId === receivableId
  );
  existingLogs.forEach((l) => stepLogsStore.delete(l.id));

  // step_logsを生成
  const baseDateStr = baseDate ?? today();
  let currentDueDate = baseDateStr;

  for (const step of steps) {
    const logId = generateId('cfslog');
    const plannedDueAt = addDays(currentDueDate, step.dueDaysAfterPrevious);

    const stepLog: ReceivableFlowStepLog = {
      id: logId,
      receivableId,
      templateId,
      stepOrder: step.stepOrder,
      plannedDueAt,
      status: step.stepOrder === 1 ? 'pending' : 'pending',
      doneAt: null,
      doneByUserId: null,
      outcome: null,
      note: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    stepLogsStore.set(logId, stepLog);
    currentDueDate = plannedDueAt;
  }

  logEvent('assignment', assignmentId, actorUserId, 'assign', existing, assignment);

  return assignment;
}

// ========== ステップ実行 ==========

export function getStepLogsByReceivable(receivableId: string): ReceivableFlowStepLog[] {
  return Array.from(stepLogsStore.values())
    .filter((l) => l.receivableId === receivableId)
    .sort((a, b) => a.stepOrder - b.stepOrder);
}

export function completeStep(
  receivableId: string,
  stepOrder: number,
  actorUserId: string,
  outcome?: StepOutcome,
  note?: string
): ReceivableFlowStepLog | null {
  const stepLog = Array.from(stepLogsStore.values()).find(
    (l) => l.receivableId === receivableId && l.stepOrder === stepOrder
  );

  if (!stepLog || stepLog.status !== 'pending') return null;

  const timestamp = now();

  const updated: ReceivableFlowStepLog = {
    ...stepLog,
    status: 'done',
    doneAt: timestamp,
    doneByUserId: actorUserId,
    outcome: outcome ?? null,
    note: note ?? null,
    updatedAt: timestamp,
  };

  stepLogsStore.set(stepLog.id, updated);

  // 次のステップの期限を計算・更新
  const nextStepLog = Array.from(stepLogsStore.values()).find(
    (l) => l.receivableId === receivableId && l.stepOrder === stepOrder + 1
  );

  if (nextStepLog) {
    const templateSteps = listStepsByTemplate(stepLog.templateId);
    const nextStep = templateSteps.find((s) => s.stepOrder === stepOrder + 1);

    if (nextStep) {
      const newDueDate = addDays(today(), nextStep.dueDaysAfterPrevious);
      nextStepLog.plannedDueAt = newDueDate;
      nextStepLog.updatedAt = timestamp;
      stepLogsStore.set(nextStepLog.id, nextStepLog);
    }
  }

  // 割当の currentStepOrder を更新
  const assignment = getAssignmentByReceivableId(receivableId);
  if (assignment) {
    const allLogs = getStepLogsByReceivable(receivableId);
    const allDone = allLogs.every((l) => l.status === 'done' || l.status === 'skipped');

    assignment.currentStepOrder = stepOrder + 1;
    assignment.status = allDone ? 'completed' : 'active';
    assignment.updatedAt = timestamp;
    assignmentsStore.set(assignment.id, assignment);
  }

  logEvent('step_log', stepLog.id, actorUserId, 'complete_step', stepLog, updated, note);

  return updated;
}

export function skipStep(
  receivableId: string,
  stepOrder: number,
  actorUserId: string,
  note?: string
): ReceivableFlowStepLog | null {
  const stepLog = Array.from(stepLogsStore.values()).find(
    (l) => l.receivableId === receivableId && l.stepOrder === stepOrder
  );

  if (!stepLog || stepLog.status !== 'pending') return null;

  const timestamp = now();

  const updated: ReceivableFlowStepLog = {
    ...stepLog,
    status: 'skipped',
    doneAt: timestamp,
    doneByUserId: actorUserId,
    note: note ?? null,
    updatedAt: timestamp,
  };

  stepLogsStore.set(stepLog.id, updated);
  logEvent('step_log', stepLog.id, actorUserId, 'skip_step', stepLog, updated, note);

  return updated;
}

// ========== 一時停止/再開 ==========

export function pauseAssignment(
  receivableId: string,
  actorUserId: string
): ReceivableFlowAssignment | null {
  const assignment = getAssignmentByReceivableId(receivableId);
  if (!assignment || assignment.status !== 'active') return null;

  const timestamp = now();
  const updated: ReceivableFlowAssignment = {
    ...assignment,
    status: 'paused',
    updatedAt: timestamp,
  };

  assignmentsStore.set(assignment.id, updated);
  logEvent('assignment', assignment.id, actorUserId, 'pause', assignment, updated);

  return updated;
}

export function resumeAssignment(
  receivableId: string,
  actorUserId: string
): ReceivableFlowAssignment | null {
  const assignment = getAssignmentByReceivableId(receivableId);
  if (!assignment || assignment.status !== 'paused') return null;

  const timestamp = now();
  const updated: ReceivableFlowAssignment = {
    ...assignment,
    status: 'active',
    updatedAt: timestamp,
  };

  assignmentsStore.set(assignment.id, updated);
  logEvent('assignment', assignment.id, actorUserId, 'resume', assignment, updated);

  return updated;
}

// ========== 統計 ==========

export interface CollectionStats {
  activeAssignments: number;
  pausedAssignments: number;
  completedAssignments: number;
  overdueSteps: number;
  pendingSteps: number;
  completedStepsThisWeek: number;
  templateCount: number;
}

// Task 049: 統計フィルタオプション
export interface CollectionStatsFilterOptions {
  businessUnitId?: string;
}

export function getStats(viewer: ViewerContext, options: CollectionStatsFilterOptions = {}): CollectionStats | null {
  if (!canViewCollectionFlow(viewer.role)) {
    return null;
  }

  let assignments = Array.from(assignmentsStore.values());
  let stepLogs = Array.from(stepLogsStore.values());
  const templates = Array.from(templatesStore.values());

  // Task 049: 事業単位フィルタ（receivableのbusinessUnitIdで絞る）
  if (options.businessUnitId) {
    // receivableIdのSetを作成
    const receivableViewer = { userId: viewer.userId, role: viewer.role as 'manager' | 'admin' | 'executive' | 'auditor' | 'staff' | 'leader' };
    const receivablesResult = receivablesRepo.listReceivables(
      receivableViewer,
      { businessUnitId: options.businessUnitId },
      { limit: 10000, offset: 0 }
    );
    const receivableIdsInBusiness = new Set(receivablesResult.items.map((r) => r.id));

    // 当該事業単位のreceivableに紐づくassignment/stepLogsのみに絞る
    assignments = assignments.filter((a) => receivableIdsInBusiness.has(a.receivableId));
    stepLogs = stepLogs.filter((l) => receivableIdsInBusiness.has(l.receivableId));
  }

  // 今週の開始日
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfWeekStr = startOfWeek.toISOString();

  const overdueSteps = stepLogs.filter(
    (l) => l.status === 'pending' && isStepOverdue(l)
  ).length;

  const completedThisWeek = stepLogs.filter(
    (l) => l.status === 'done' && l.doneAt && l.doneAt >= startOfWeekStr
  ).length;

  return {
    activeAssignments: assignments.filter((a) => a.status === 'active').length,
    pausedAssignments: assignments.filter((a) => a.status === 'paused').length,
    completedAssignments: assignments.filter((a) => a.status === 'completed').length,
    overdueSteps,
    pendingSteps: stepLogs.filter((l) => l.status === 'pending').length,
    completedStepsThisWeek: completedThisWeek,
    templateCount: templates.filter((t) => t.isActive).length,
  };
}

// ========== 期限超過スキャン ==========

export interface OverdueStepInfo {
  stepLog: ReceivableFlowStepLog;
  assignment: ReceivableFlowAssignment | null;
  template: CollectionFlowTemplate | null;
  step: CollectionFlowStep | null;
  overdueDays: number;
}

export function scanOverdueSteps(): OverdueStepInfo[] {
  const stepLogs = Array.from(stepLogsStore.values());
  const overdueInfos: OverdueStepInfo[] = [];

  for (const stepLog of stepLogs) {
    if (stepLog.status !== 'pending') continue;

    const todayStr = today();
    if (stepLog.plannedDueAt >= todayStr) continue;

    const assignment = getAssignmentByReceivableId(stepLog.receivableId);
    if (assignment?.status !== 'active') continue;

    const template = getTemplateById(stepLog.templateId);
    const steps = listStepsByTemplate(stepLog.templateId);
    const step = steps.find((s) => s.stepOrder === stepLog.stepOrder) ?? null;

    const dueDate = new Date(stepLog.plannedDueAt);
    const todayDate = new Date(todayStr);
    const overdueDays = Math.ceil(
      (todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    overdueInfos.push({
      stepLog,
      assignment,
      template,
      step,
      overdueDays,
    });
  }

  // 超過日数でソート（降順）
  overdueInfos.sort((a, b) => b.overdueDays - a.overdueDays);

  return overdueInfos;
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (templatesStore.size > 0) return;

  const timestamp = now();

  // テンプレート1: 標準回収フロー（個人）
  const template1: CollectionFlowTemplate = {
    id: 'cftpl_demo_001',
    name: '標準回収フロー（個人）',
    subjectType: 'client',
    description: '個人利用者向けの標準的な回収フロー。電話→SMS→書面の3段階。',
    isActive: true,
    createdAt: '2026-01-01T09:00:00Z',
    updatedAt: '2026-01-01T09:00:00Z',
    createdByUserId: 'system',
  };
  templatesStore.set(template1.id, template1);

  // テンプレート1のステップ
  const steps1: Omit<CollectionFlowStep, 'createdAt' | 'updatedAt'>[] = [
    {
      id: 'cfstep_demo_001',
      templateId: 'cftpl_demo_001',
      stepOrder: 1,
      actionType: 'call',
      dueDaysAfterPrevious: 3,
      messageTemplate: '○○様、お支払いの確認のためご連絡いたしました。',
      expectedOutcome: 'promised',
      severity: 'info',
      isActive: true,
    },
    {
      id: 'cfstep_demo_002',
      templateId: 'cftpl_demo_001',
      stepOrder: 2,
      actionType: 'sms',
      dueDaysAfterPrevious: 5,
      messageTemplate: 'お支払い期限が過ぎております。ご確認をお願いいたします。',
      expectedOutcome: 'promised',
      severity: 'warning',
      isActive: true,
    },
    {
      id: 'cfstep_demo_003',
      templateId: 'cftpl_demo_001',
      stepOrder: 3,
      actionType: 'letter',
      dueDaysAfterPrevious: 7,
      messageTemplate: '督促状を送付いたします。',
      expectedOutcome: 'paid',
      severity: 'critical',
      isActive: true,
    },
  ];

  steps1.forEach((s) => {
    stepsStore.set(s.id, {
      ...s,
      createdAt: '2026-01-01T09:00:00Z',
      updatedAt: '2026-01-01T09:00:00Z',
    });
  });

  // テンプレート2: 法人回収フロー
  const template2: CollectionFlowTemplate = {
    id: 'cftpl_demo_002',
    name: '法人回収フロー',
    subjectType: 'company',
    description: '法人取引先向けの回収フロー。メール中心で丁寧に対応。',
    isActive: true,
    createdAt: '2026-01-01T09:00:00Z',
    updatedAt: '2026-01-01T09:00:00Z',
    createdByUserId: 'system',
  };
  templatesStore.set(template2.id, template2);

  // テンプレート2のステップ
  const steps2: Omit<CollectionFlowStep, 'createdAt' | 'updatedAt'>[] = [
    {
      id: 'cfstep_demo_004',
      templateId: 'cftpl_demo_002',
      stepOrder: 1,
      actionType: 'email',
      dueDaysAfterPrevious: 5,
      messageTemplate: 'ご担当者様、請求書の件でご連絡いたしました。',
      expectedOutcome: 'promised',
      severity: 'info',
      isActive: true,
    },
    {
      id: 'cfstep_demo_005',
      templateId: 'cftpl_demo_002',
      stepOrder: 2,
      actionType: 'call',
      dueDaysAfterPrevious: 7,
      messageTemplate: '経理ご担当者様宛にお電話いたします。',
      expectedOutcome: 'promised',
      severity: 'warning',
      isActive: true,
    },
    {
      id: 'cfstep_demo_006',
      templateId: 'cftpl_demo_002',
      stepOrder: 3,
      actionType: 'visit',
      dueDaysAfterPrevious: 10,
      messageTemplate: '訪問して直接お話しさせていただきます。',
      expectedOutcome: 'paid',
      severity: 'critical',
      isActive: true,
    },
  ];

  steps2.forEach((s) => {
    stepsStore.set(s.id, {
      ...s,
      createdAt: '2026-01-01T09:00:00Z',
      updatedAt: '2026-01-01T09:00:00Z',
    });
  });

  // デモ割当: recv_demo_001 にテンプレート1を割当
  const assignment1: ReceivableFlowAssignment = {
    id: 'cfasgn_demo_001',
    receivableId: 'recv_demo_001',
    templateId: 'cftpl_demo_001',
    assignedAt: '2026-01-26T09:00:00Z',
    assignedByUserId: 'user_manager',
    currentStepOrder: 2,
    status: 'active',
    updatedAt: '2026-01-28T10:00:00Z',
  };
  assignmentsStore.set(assignment1.id, assignment1);

  // デモステップログ
  const stepLogs1: Omit<ReceivableFlowStepLog, 'createdAt' | 'updatedAt'>[] = [
    {
      id: 'cfslog_demo_001',
      receivableId: 'recv_demo_001',
      templateId: 'cftpl_demo_001',
      stepOrder: 1,
      plannedDueAt: '2026-01-29',
      status: 'done',
      doneAt: '2026-01-28T10:00:00Z',
      doneByUserId: 'user_manager',
      outcome: 'no_answer',
      note: '不在のため留守電にメッセージ',
    },
    {
      id: 'cfslog_demo_002',
      receivableId: 'recv_demo_001',
      templateId: 'cftpl_demo_001',
      stepOrder: 2,
      plannedDueAt: '2026-02-01',
      status: 'pending',
      doneAt: null,
      doneByUserId: null,
      outcome: null,
      note: null,
    },
    {
      id: 'cfslog_demo_003',
      receivableId: 'recv_demo_001',
      templateId: 'cftpl_demo_001',
      stepOrder: 3,
      plannedDueAt: '2026-02-08',
      status: 'pending',
      doneAt: null,
      doneByUserId: null,
      outcome: null,
      note: null,
    },
  ];

  stepLogs1.forEach((l) => {
    stepLogsStore.set(l.id, {
      ...l,
      createdAt: '2026-01-26T09:00:00Z',
      updatedAt: l.doneAt ?? '2026-01-26T09:00:00Z',
    });
  });

  // デモ割当2: recv_demo_003 にテンプレート2を割当（期限超過）
  const assignment2: ReceivableFlowAssignment = {
    id: 'cfasgn_demo_002',
    receivableId: 'recv_demo_003',
    templateId: 'cftpl_demo_002',
    assignedAt: '2026-01-10T09:00:00Z',
    assignedByUserId: 'user_manager',
    currentStepOrder: 2,
    status: 'active',
    updatedAt: '2026-01-20T11:00:00Z',
  };
  assignmentsStore.set(assignment2.id, assignment2);

  const stepLogs2: Omit<ReceivableFlowStepLog, 'createdAt' | 'updatedAt'>[] = [
    {
      id: 'cfslog_demo_004',
      receivableId: 'recv_demo_003',
      templateId: 'cftpl_demo_002',
      stepOrder: 1,
      plannedDueAt: '2026-01-15',
      status: 'done',
      doneAt: '2026-01-15T11:00:00Z',
      doneByUserId: 'user_manager',
      outcome: 'other',
      note: 'メール送付済み、返信待ち',
    },
    {
      id: 'cfslog_demo_005',
      receivableId: 'recv_demo_003',
      templateId: 'cftpl_demo_002',
      stepOrder: 2,
      plannedDueAt: '2026-01-22',
      status: 'pending',
      doneAt: null,
      doneByUserId: null,
      outcome: null,
      note: null,
    },
    {
      id: 'cfslog_demo_006',
      receivableId: 'recv_demo_003',
      templateId: 'cftpl_demo_002',
      stepOrder: 3,
      plannedDueAt: '2026-02-01',
      status: 'pending',
      doneAt: null,
      doneByUserId: null,
      outcome: null,
      note: null,
    },
  ];

  stepLogs2.forEach((l) => {
    stepLogsStore.set(l.id, {
      ...l,
      createdAt: '2026-01-10T09:00:00Z',
      updatedAt: l.doneAt ?? '2026-01-10T09:00:00Z',
    });
  });
}

// 初期化
initDemoData();
