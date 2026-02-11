/**
 * 回収フロー（Collection Flow）Firestoreリポジトリ
 *
 * PROD: Cloud Firestore永続化
 *
 * コレクション:
 * - collection_templates: フローテンプレート
 * - collection_steps: テンプレートステップ
 * - collection_assignments: 未収×フロー割当
 * - collection_step_logs: ステップ実行ログ
 * - collection_events: 監査ログ
 */

import { getAdminDb } from '../firebase-admin';
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

// Task 049: receivables のインポート
import * as receivablesRepo from '@/lib/receivables/repo';

// ========== 定数 ==========

const TEMPLATES_COLLECTION = 'collection_templates';
const STEPS_COLLECTION = 'collection_steps';
const ASSIGNMENTS_COLLECTION = 'collection_assignments';
const STEP_LOGS_COLLECTION = 'collection_step_logs';
const EVENTS_COLLECTION = 'collection_events';

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

// ========== ドキュメント変換 ==========

function docToTemplate(doc: FirebaseFirestore.DocumentSnapshot): CollectionFlowTemplate {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    name: d.name ?? '',
    subjectType: d.subjectType ?? null,
    description: d.description ?? null,
    isActive: d.isActive ?? true,
    createdAt: d.createdAt ?? now(),
    updatedAt: d.updatedAt ?? now(),
    createdByUserId: d.createdByUserId ?? '',
  };
}

function docToStep(doc: FirebaseFirestore.DocumentSnapshot): CollectionFlowStep {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    templateId: d.templateId ?? '',
    stepOrder: d.stepOrder ?? 0,
    actionType: d.actionType ?? 'other',
    dueDaysAfterPrevious: d.dueDaysAfterPrevious ?? 0,
    messageTemplate: d.messageTemplate ?? null,
    expectedOutcome: d.expectedOutcome ?? null,
    severity: d.severity ?? 'info',
    isActive: d.isActive ?? true,
    createdAt: d.createdAt ?? now(),
    updatedAt: d.updatedAt ?? now(),
  };
}

function docToAssignment(doc: FirebaseFirestore.DocumentSnapshot): ReceivableFlowAssignment {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    receivableId: d.receivableId ?? '',
    templateId: d.templateId ?? '',
    assignedAt: d.assignedAt ?? now(),
    assignedByUserId: d.assignedByUserId ?? null,
    currentStepOrder: d.currentStepOrder ?? 1,
    status: d.status ?? 'active',
    updatedAt: d.updatedAt ?? now(),
  };
}

function docToStepLog(doc: FirebaseFirestore.DocumentSnapshot): ReceivableFlowStepLog {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    receivableId: d.receivableId ?? '',
    templateId: d.templateId ?? '',
    stepOrder: d.stepOrder ?? 0,
    plannedDueAt: d.plannedDueAt ?? '',
    status: d.status ?? 'pending',
    doneAt: d.doneAt ?? null,
    doneByUserId: d.doneByUserId ?? null,
    outcome: d.outcome ?? null,
    note: d.note ?? null,
    createdAt: d.createdAt ?? now(),
    updatedAt: d.updatedAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): CollectionEvent {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    entityType: d.entityType ?? 'template',
    entityId: d.entityId ?? '',
    actorUserId: d.actorUserId ?? '',
    action: d.action ?? 'create',
    beforeJson: d.beforeJson ?? null,
    afterJson: d.afterJson ?? null,
    createdAt: d.createdAt ?? now(),
    note: d.note ?? null,
  };
}

// ========== 監査ログ記録 ==========

async function logEvent(
  entityType: CollectionEntityType,
  entityId: string,
  actorUserId: string,
  action: CollectionEventAction,
  beforeData: unknown | null,
  afterData: unknown | null,
  note: string | null = null
): Promise<void> {
  try {
    const db = getAdminDb();
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
    await db.collection(EVENTS_COLLECTION).doc(event.id).set(event);
  } catch (error) {
    console.error('[Collection:Firestore] logEvent error:', error);
  }
}

export async function getAllCollectionEvents(limit: number = 1000): Promise<CollectionEvent[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(EVENTS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(docToEvent);
  } catch (error) {
    console.error('[Collection:Firestore] getAllCollectionEvents error:', error);
    return [];
  }
}

// ========== テンプレート CRUD ==========

export interface CreateTemplateInput {
  name: string;
  subjectType?: CollectionSubjectType;
  description?: string | null;
}

export async function listTemplates(
  viewer: ViewerContext,
  activeOnly: boolean = false
): Promise<CollectionFlowTemplate[]> {
  if (!canViewCollectionFlow(viewer.role)) {
    return [];
  }

  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(TEMPLATES_COLLECTION);

    if (activeOnly) {
      query = query.where('isActive', '==', true);
    }

    const snapshot = await query.get();
    const items = snapshot.docs.map(docToTemplate);
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  } catch (error) {
    console.error('[Collection:Firestore] listTemplates error:', error);
    return [];
  }
}

export async function getTemplateById(id: string): Promise<CollectionFlowTemplate | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(TEMPLATES_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return docToTemplate(doc);
  } catch (error) {
    console.error('[Collection:Firestore] getTemplateById error:', error);
    return null;
  }
}

export async function createTemplate(
  input: CreateTemplateInput,
  actorUserId: string
): Promise<CollectionFlowTemplate> {
  const db = getAdminDb();
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

  await db.collection(TEMPLATES_COLLECTION).doc(id).set(template);
  await logEvent('template', id, actorUserId, 'create', null, template);

  return template;
}

export async function updateTemplate(
  id: string,
  patch: Partial<CreateTemplateInput> & { isActive?: boolean },
  actorUserId: string
): Promise<CollectionFlowTemplate | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(TEMPLATES_COLLECTION).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const existing = docToTemplate(doc);
    const updated: CollectionFlowTemplate = {
      ...existing,
      ...patch,
      updatedAt: now(),
    };

    await docRef.set(updated);
    await logEvent('template', id, actorUserId, 'update', existing, updated);

    return updated;
  } catch (error) {
    console.error('[Collection:Firestore] updateTemplate error:', error);
    return null;
  }
}

// ========== ステップ CRUD ==========

export interface CreateStepInput {
  actionType: CollectionActionType;
  dueDaysAfterPrevious: number;
  messageTemplate?: string | null;
  expectedOutcome?: ExpectedOutcome;
  severity?: StepSeverity;
}

export async function listStepsByTemplate(templateId: string): Promise<CollectionFlowStep[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(STEPS_COLLECTION)
      .where('templateId', '==', templateId)
      .where('isActive', '==', true)
      .get();

    const items = snapshot.docs.map(docToStep);
    items.sort((a, b) => a.stepOrder - b.stepOrder);
    return items;
  } catch (error) {
    console.error('[Collection:Firestore] listStepsByTemplate error:', error);
    return [];
  }
}

export async function getStepById(id: string): Promise<CollectionFlowStep | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(STEPS_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return docToStep(doc);
  } catch (error) {
    console.error('[Collection:Firestore] getStepById error:', error);
    return null;
  }
}

export async function createStep(
  templateId: string,
  input: CreateStepInput,
  actorUserId: string
): Promise<CollectionFlowStep> {
  const db = getAdminDb();
  const id = generateId('cfstep');
  const timestamp = now();

  const existingSteps = await listStepsByTemplate(templateId);
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

  await db.collection(STEPS_COLLECTION).doc(id).set(step);
  return step;
}

export async function updateStep(
  id: string,
  patch: Partial<CreateStepInput> & { isActive?: boolean },
  actorUserId: string
): Promise<CollectionFlowStep | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(STEPS_COLLECTION).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const existing = docToStep(doc);
    const updated: CollectionFlowStep = {
      ...existing,
      ...patch,
      updatedAt: now(),
    };

    await docRef.set(updated);
    return updated;
  } catch (error) {
    console.error('[Collection:Firestore] updateStep error:', error);
    return null;
  }
}

export async function reorderSteps(
  templateId: string,
  orderedStepIds: string[],
  actorUserId: string
): Promise<boolean> {
  try {
    const db = getAdminDb();
    const batch = db.batch();

    let order = 1;
    for (const stepId of orderedStepIds) {
      const docRef = db.collection(STEPS_COLLECTION).doc(stepId);
      batch.update(docRef, { stepOrder: order, updatedAt: now() });
      order++;
    }

    await batch.commit();
    return true;
  } catch (error) {
    console.error('[Collection:Firestore] reorderSteps error:', error);
    return false;
  }
}

// ========== フロー割当 ==========

export async function getAssignmentByReceivableId(
  receivableId: string
): Promise<ReceivableFlowAssignment | null> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(ASSIGNMENTS_COLLECTION)
      .where('receivableId', '==', receivableId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return docToAssignment(snapshot.docs[0]);
  } catch (error) {
    console.error('[Collection:Firestore] getAssignmentByReceivableId error:', error);
    return null;
  }
}

export async function assignFlow(
  receivableId: string,
  templateId: string,
  actorUserId: string,
  baseDate?: string
): Promise<ReceivableFlowAssignment | null> {
  try {
    const template = await getTemplateById(templateId);
    if (!template || !template.isActive) return null;

    const steps = await listStepsByTemplate(templateId);
    if (steps.length === 0) return null;

    const db = getAdminDb();
    const existing = await getAssignmentByReceivableId(receivableId);
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

    const batch = db.batch();
    batch.set(db.collection(ASSIGNMENTS_COLLECTION).doc(assignmentId), assignment);

    // 既存のstep_logsを削除
    const existingLogsSnapshot = await db.collection(STEP_LOGS_COLLECTION)
      .where('receivableId', '==', receivableId)
      .get();
    for (const logDoc of existingLogsSnapshot.docs) {
      batch.delete(logDoc.ref);
    }

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
        status: 'pending',
        doneAt: null,
        doneByUserId: null,
        outcome: null,
        note: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      batch.set(db.collection(STEP_LOGS_COLLECTION).doc(logId), stepLog);
      currentDueDate = plannedDueAt;
    }

    await batch.commit();
    await logEvent('assignment', assignmentId, actorUserId, 'assign', existing, assignment);

    return assignment;
  } catch (error) {
    console.error('[Collection:Firestore] assignFlow error:', error);
    return null;
  }
}

// ========== ステップ実行 ==========

export async function getStepLogsByReceivable(receivableId: string): Promise<ReceivableFlowStepLog[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(STEP_LOGS_COLLECTION)
      .where('receivableId', '==', receivableId)
      .get();

    const items = snapshot.docs.map(docToStepLog);
    items.sort((a, b) => a.stepOrder - b.stepOrder);
    return items;
  } catch (error) {
    console.error('[Collection:Firestore] getStepLogsByReceivable error:', error);
    return [];
  }
}

export async function completeStep(
  receivableId: string,
  stepOrder: number,
  actorUserId: string,
  outcome?: StepOutcome,
  note?: string
): Promise<ReceivableFlowStepLog | null> {
  try {
    const db = getAdminDb();

    // 対象のstepLogを検索
    const snapshot = await db.collection(STEP_LOGS_COLLECTION)
      .where('receivableId', '==', receivableId)
      .where('stepOrder', '==', stepOrder)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const stepLog = docToStepLog(snapshot.docs[0]);
    if (stepLog.status !== 'pending') return null;

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

    const batch = db.batch();
    batch.set(snapshot.docs[0].ref, updated);

    // 次のステップの期限を更新
    const nextSnapshot = await db.collection(STEP_LOGS_COLLECTION)
      .where('receivableId', '==', receivableId)
      .where('stepOrder', '==', stepOrder + 1)
      .limit(1)
      .get();

    if (!nextSnapshot.empty) {
      const templateSteps = await listStepsByTemplate(stepLog.templateId);
      const nextStep = templateSteps.find((s) => s.stepOrder === stepOrder + 1);
      if (nextStep) {
        const newDueDate = addDays(today(), nextStep.dueDaysAfterPrevious);
        batch.update(nextSnapshot.docs[0].ref, {
          plannedDueAt: newDueDate,
          updatedAt: timestamp,
        });
      }
    }

    // 割当の currentStepOrder を更新
    const assignment = await getAssignmentByReceivableId(receivableId);
    if (assignment) {
      const allLogs = await getStepLogsByReceivable(receivableId);
      // この更新を反映（まだcommitしていないのでメモリ上で反映）
      const updatedLogs = allLogs.map((l) =>
        l.id === stepLog.id ? updated : l
      );
      const allDone = updatedLogs.every(
        (l) => l.status === 'done' || l.status === 'skipped'
      );

      const assignmentRef = db.collection(ASSIGNMENTS_COLLECTION).doc(assignment.id);
      batch.update(assignmentRef, {
        currentStepOrder: stepOrder + 1,
        status: allDone ? 'completed' : 'active',
        updatedAt: timestamp,
      });
    }

    await batch.commit();
    await logEvent('step_log', stepLog.id, actorUserId, 'complete_step', stepLog, updated, note ?? null);

    return updated;
  } catch (error) {
    console.error('[Collection:Firestore] completeStep error:', error);
    return null;
  }
}

export async function skipStep(
  receivableId: string,
  stepOrder: number,
  actorUserId: string,
  note?: string
): Promise<ReceivableFlowStepLog | null> {
  try {
    const db = getAdminDb();

    const snapshot = await db.collection(STEP_LOGS_COLLECTION)
      .where('receivableId', '==', receivableId)
      .where('stepOrder', '==', stepOrder)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const stepLog = docToStepLog(snapshot.docs[0]);
    if (stepLog.status !== 'pending') return null;

    const timestamp = now();
    const updated: ReceivableFlowStepLog = {
      ...stepLog,
      status: 'skipped',
      doneAt: timestamp,
      doneByUserId: actorUserId,
      note: note ?? null,
      updatedAt: timestamp,
    };

    await snapshot.docs[0].ref.set(updated);
    await logEvent('step_log', stepLog.id, actorUserId, 'skip_step', stepLog, updated, note ?? null);

    return updated;
  } catch (error) {
    console.error('[Collection:Firestore] skipStep error:', error);
    return null;
  }
}

// ========== 一時停止/再開 ==========

export async function pauseAssignment(
  receivableId: string,
  actorUserId: string
): Promise<ReceivableFlowAssignment | null> {
  try {
    const assignment = await getAssignmentByReceivableId(receivableId);
    if (!assignment || assignment.status !== 'active') return null;

    const db = getAdminDb();
    const timestamp = now();
    const updated: ReceivableFlowAssignment = {
      ...assignment,
      status: 'paused',
      updatedAt: timestamp,
    };

    await db.collection(ASSIGNMENTS_COLLECTION).doc(assignment.id).set(updated);
    await logEvent('assignment', assignment.id, actorUserId, 'pause', assignment, updated);

    return updated;
  } catch (error) {
    console.error('[Collection:Firestore] pauseAssignment error:', error);
    return null;
  }
}

export async function resumeAssignment(
  receivableId: string,
  actorUserId: string
): Promise<ReceivableFlowAssignment | null> {
  try {
    const assignment = await getAssignmentByReceivableId(receivableId);
    if (!assignment || assignment.status !== 'paused') return null;

    const db = getAdminDb();
    const timestamp = now();
    const updated: ReceivableFlowAssignment = {
      ...assignment,
      status: 'active',
      updatedAt: timestamp,
    };

    await db.collection(ASSIGNMENTS_COLLECTION).doc(assignment.id).set(updated);
    await logEvent('assignment', assignment.id, actorUserId, 'resume', assignment, updated);

    return updated;
  } catch (error) {
    console.error('[Collection:Firestore] resumeAssignment error:', error);
    return null;
  }
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

export interface CollectionStatsFilterOptions {
  businessUnitId?: string;
}

export async function getStats(
  viewer: ViewerContext,
  options: CollectionStatsFilterOptions = {}
): Promise<CollectionStats | null> {
  if (!canViewCollectionFlow(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();

    const assignmentsSnapshot = await db.collection(ASSIGNMENTS_COLLECTION).get();
    let assignments = assignmentsSnapshot.docs.map(docToAssignment);

    const stepLogsSnapshot = await db.collection(STEP_LOGS_COLLECTION).get();
    let stepLogs = stepLogsSnapshot.docs.map(docToStepLog);

    const templatesSnapshot = await db.collection(TEMPLATES_COLLECTION).get();
    const templates = templatesSnapshot.docs.map(docToTemplate);

    // Task 049: 事業単位フィルタ
    if (options.businessUnitId) {
      const receivableViewer = {
        userId: viewer.userId,
        role: viewer.role as 'manager' | 'admin' | 'executive' | 'auditor' | 'staff' | 'leader',
      };
      const receivablesResult = receivablesRepo.listReceivables(
        receivableViewer,
        { businessUnitId: options.businessUnitId },
        { limit: 10000, offset: 0 }
      );
      const receivableIdsInBusiness = new Set(receivablesResult.items.map((r) => r.id));

      assignments = assignments.filter((a) => receivableIdsInBusiness.has(a.receivableId));
      stepLogs = stepLogs.filter((l) => receivableIdsInBusiness.has(l.receivableId));
    }

    const nowDate = new Date();
    const startOfWeek = new Date(nowDate);
    startOfWeek.setDate(nowDate.getDate() - nowDate.getDay());
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
  } catch (error) {
    console.error('[Collection:Firestore] getStats error:', error);
    return null;
  }
}

// ========== 期限超過スキャン ==========

export interface OverdueStepInfo {
  stepLog: ReceivableFlowStepLog;
  assignment: ReceivableFlowAssignment | null;
  template: CollectionFlowTemplate | null;
  step: CollectionFlowStep | null;
  overdueDays: number;
}

export async function scanOverdueSteps(): Promise<OverdueStepInfo[]> {
  try {
    const db = getAdminDb();
    const stepLogsSnapshot = await db.collection(STEP_LOGS_COLLECTION)
      .where('status', '==', 'pending')
      .get();

    const stepLogs = stepLogsSnapshot.docs.map(docToStepLog);
    const todayStr = today();
    const overdueInfos: OverdueStepInfo[] = [];

    for (const stepLog of stepLogs) {
      if (stepLog.plannedDueAt >= todayStr) continue;

      const assignment = await getAssignmentByReceivableId(stepLog.receivableId);
      if (assignment?.status !== 'active') continue;

      const template = await getTemplateById(stepLog.templateId);
      const steps = await listStepsByTemplate(stepLog.templateId);
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

    overdueInfos.sort((a, b) => b.overdueDays - a.overdueDays);
    return overdueInfos;
  } catch (error) {
    console.error('[Collection:Firestore] scanOverdueSteps error:', error);
    return [];
  }
}
