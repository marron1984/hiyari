/**
 * 承認フロー Firestoreリポジトリ
 *
 * PROD-003: 本番永続化
 *
 * コレクション: approval_flows, approval_flow_steps
 * フロー定義とステップの管理
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  ApprovalFlow,
  ApprovalFlowStep,
  CreateApprovalFlowRequest,
  UpdateApprovalFlowRequest,
  CreateApprovalFlowStepRequest,
  UpdateApprovalFlowStepRequest,
  ApprovalFlowFilter,
} from './types';

// ========== 定数 ==========

const FLOWS_COLLECTION = 'approval_flows';
const STEPS_COLLECTION = 'approval_flow_steps';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateFlowId(): string {
  return `flow_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ========== コンバーター ==========

function docToFlow(doc: FirebaseFirestore.DocumentSnapshot): ApprovalFlow {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    name: data.name ?? '',
    requestType: data.requestType ?? 'generic',
    status: data.status ?? 'draft',
    version: data.version ?? 0,
    description: data.description ?? null,
    conditionJson: data.conditionJson ?? null,
    steps: data.steps ?? [],
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToStep(doc: FirebaseFirestore.DocumentSnapshot): ApprovalFlowStep {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    flowId: data.flowId ?? '',
    stepOrder: data.stepOrder ?? 0,
    approverType: data.approverType ?? 'role',
    approverRole: data.approverRole ?? null,
    approverUserId: data.approverUserId ?? null,
    approverUserName: data.approverUserName,
    required: data.required ?? 'any',
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

// ========== ステップ取得ヘルパー ==========

async function getStepsForFlow(flowId: string): Promise<ApprovalFlowStep[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(STEPS_COLLECTION)
    .where('flowId', '==', flowId)
    .orderBy('stepOrder', 'asc')
    .get();
  return snapshot.docs.map(docToStep);
}

// ========================================
// フロー操作
// ========================================

/**
 * フロー一覧取得
 */
export async function listApprovalFlows(filter: ApprovalFlowFilter = {}): Promise<{
  flows: ApprovalFlow[];
  total: number;
}> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(FLOWS_COLLECTION);

  if (filter.requestType) {
    q = q.where('requestType', '==', filter.requestType);
  }
  if (filter.status) {
    q = q.where('status', '==', filter.status);
  }

  const snapshot = await q.get();
  let flows = snapshot.docs.map(docToFlow);

  // ステップを付加
  for (const flow of flows) {
    flow.steps = await getStepsForFlow(flow.id);
  }

  const total = flows.length;

  // ソート（更新日時降順）
  flows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  flows = flows.slice(offset, offset + limit);

  return { flows, total };
}

/**
 * フロー取得
 */
export async function getApprovalFlow(flowId: string): Promise<ApprovalFlow | null> {
  const db = getAdminDb();
  const doc = await db.collection(FLOWS_COLLECTION).doc(flowId).get();
  if (!doc.exists) return null;

  const flow = docToFlow(doc);
  flow.steps = await getStepsForFlow(flowId);
  return flow;
}

/**
 * フロー作成（draft）
 */
export async function createApprovalFlow(
  data: CreateApprovalFlowRequest
): Promise<{ success: boolean; flow?: ApprovalFlow; error?: string }> {
  const db = getAdminDb();
  const timestamp = now();
  const flowId = generateFlowId();

  const flow: ApprovalFlow = {
    id: flowId,
    name: data.name,
    requestType: data.requestType,
    status: 'draft',
    version: 0,
    description: data.description ?? null,
    conditionJson: data.conditionJson ?? null,
    steps: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // フローを保存（stepsはサブコレクションに）
  const { steps: _, ...flowWithoutSteps } = flow;
  await db.collection(FLOWS_COLLECTION).doc(flowId).set(flowWithoutSteps);

  // ステップがあれば追加
  if (data.steps && data.steps.length > 0) {
    const batch = db.batch();
    for (const stepData of data.steps) {
      const stepId = generateStepId();
      const step: ApprovalFlowStep = {
        id: stepId,
        flowId,
        stepOrder: stepData.stepOrder,
        approverType: stepData.approverType,
        approverRole: stepData.approverRole ?? null,
        approverUserId: stepData.approverUserId ?? null,
        required: stepData.required ?? 'any',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      batch.set(db.collection(STEPS_COLLECTION).doc(stepId), step);
      flow.steps.push(step);
    }
    await batch.commit();
    flow.steps.sort((a, b) => a.stepOrder - b.stepOrder);
  }

  return { success: true, flow };
}

/**
 * フロー更新（draftのみ）
 */
export async function updateApprovalFlow(
  flowId: string,
  data: UpdateApprovalFlowRequest
): Promise<{ success: boolean; flow?: ApprovalFlow; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(FLOWS_COLLECTION).doc(flowId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: 'フローが見つかりません' };
  }

  const existing = docToFlow(doc);

  if (existing.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ編集可能です' };
  }

  const timestamp = now();
  const updates: Record<string, unknown> = {
    updatedAt: timestamp,
  };

  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.conditionJson !== undefined) updates.conditionJson = data.conditionJson;

  await docRef.update(updates);

  const updated: ApprovalFlow = {
    ...existing,
    name: data.name ?? existing.name,
    description: data.description !== undefined ? data.description : existing.description,
    conditionJson: data.conditionJson !== undefined ? data.conditionJson : existing.conditionJson,
    updatedAt: timestamp,
  };
  updated.steps = await getStepsForFlow(flowId);

  return { success: true, flow: updated };
}

/**
 * フロー公開（draft → published, version++）
 */
export async function publishApprovalFlow(flowId: string): Promise<{
  success: boolean;
  flow?: ApprovalFlow;
  error?: string;
}> {
  const db = getAdminDb();
  const docRef = db.collection(FLOWS_COLLECTION).doc(flowId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: 'フローが見つかりません' };
  }

  const existing = docToFlow(doc);

  if (existing.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ公開可能です' };
  }

  const steps = await getStepsForFlow(flowId);
  if (steps.length === 0) {
    return { success: false, error: '承認ステップが設定されていません' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'published',
    version: existing.version + 1,
    updatedAt: timestamp,
  });

  const published: ApprovalFlow = {
    ...existing,
    status: 'published',
    version: existing.version + 1,
    updatedAt: timestamp,
    steps,
  };

  return { success: true, flow: published };
}

/**
 * フローアーカイブ（published → archived）
 */
export async function archiveApprovalFlow(flowId: string): Promise<{
  success: boolean;
  flow?: ApprovalFlow;
  error?: string;
}> {
  const db = getAdminDb();
  const docRef = db.collection(FLOWS_COLLECTION).doc(flowId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: 'フローが見つかりません' };
  }

  const existing = docToFlow(doc);

  if (existing.status === 'archived') {
    return { success: false, error: '既にアーカイブ済みです' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'archived',
    updatedAt: timestamp,
  });

  const archived: ApprovalFlow = {
    ...existing,
    status: 'archived',
    updatedAt: timestamp,
  };
  archived.steps = await getStepsForFlow(flowId);

  return { success: true, flow: archived };
}

// ========================================
// ステップ操作
// ========================================

/**
 * ステップ追加
 */
export async function addFlowStep(
  flowId: string,
  data: CreateApprovalFlowStepRequest
): Promise<{ success: boolean; step?: ApprovalFlowStep; error?: string }> {
  const db = getAdminDb();
  const flowDoc = await db.collection(FLOWS_COLLECTION).doc(flowId).get();

  if (!flowDoc.exists) {
    return { success: false, error: 'フローが見つかりません' };
  }

  const flow = docToFlow(flowDoc);

  if (flow.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ編集可能です' };
  }

  const timestamp = now();
  const stepId = generateStepId();
  const step: ApprovalFlowStep = {
    id: stepId,
    flowId,
    stepOrder: data.stepOrder,
    approverType: data.approverType,
    approverRole: data.approverRole ?? null,
    approverUserId: data.approverUserId ?? null,
    required: data.required ?? 'any',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(STEPS_COLLECTION).doc(stepId).set(step);

  // フローのupdatedAtを更新
  await db.collection(FLOWS_COLLECTION).doc(flowId).update({
    updatedAt: timestamp,
  });

  return { success: true, step };
}

/**
 * ステップ更新
 */
export async function updateFlowStep(
  stepId: string,
  data: UpdateApprovalFlowStepRequest
): Promise<{ success: boolean; step?: ApprovalFlowStep; error?: string }> {
  const db = getAdminDb();
  const stepDoc = await db.collection(STEPS_COLLECTION).doc(stepId).get();

  if (!stepDoc.exists) {
    return { success: false, error: 'ステップが見つかりません' };
  }

  const existing = docToStep(stepDoc);

  const flowDoc = await db.collection(FLOWS_COLLECTION).doc(existing.flowId).get();
  if (!flowDoc.exists) {
    return { success: false, error: 'フローが見つかりません' };
  }

  const flow = docToFlow(flowDoc);
  if (flow.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ編集可能です' };
  }

  const timestamp = now();
  const updates: Record<string, unknown> = { updatedAt: timestamp };

  if (data.stepOrder !== undefined) updates.stepOrder = data.stepOrder;
  if (data.approverType !== undefined) updates.approverType = data.approverType;
  if (data.approverRole !== undefined) updates.approverRole = data.approverRole;
  if (data.approverUserId !== undefined) updates.approverUserId = data.approverUserId;
  if (data.required !== undefined) updates.required = data.required;

  await db.collection(STEPS_COLLECTION).doc(stepId).update(updates);

  // フローのupdatedAtを更新
  await db.collection(FLOWS_COLLECTION).doc(existing.flowId).update({
    updatedAt: timestamp,
  });

  const updated: ApprovalFlowStep = {
    ...existing,
    stepOrder: data.stepOrder ?? existing.stepOrder,
    approverType: data.approverType ?? existing.approverType,
    approverRole: data.approverRole !== undefined ? data.approverRole : existing.approverRole,
    approverUserId: data.approverUserId !== undefined ? data.approverUserId : existing.approverUserId,
    required: data.required ?? existing.required,
    updatedAt: timestamp,
  };

  return { success: true, step: updated };
}

/**
 * ステップ削除
 */
export async function removeFlowStep(stepId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = getAdminDb();
  const stepDoc = await db.collection(STEPS_COLLECTION).doc(stepId).get();

  if (!stepDoc.exists) {
    return { success: false, error: 'ステップが見つかりません' };
  }

  const existing = docToStep(stepDoc);

  const flowDoc = await db.collection(FLOWS_COLLECTION).doc(existing.flowId).get();
  if (!flowDoc.exists) {
    return { success: false, error: 'フローが見つかりません' };
  }

  const flow = docToFlow(flowDoc);
  if (flow.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ編集可能です' };
  }

  const timestamp = now();
  await db.collection(STEPS_COLLECTION).doc(stepId).delete();

  // フローのupdatedAtを更新
  await db.collection(FLOWS_COLLECTION).doc(existing.flowId).update({
    updatedAt: timestamp,
  });

  return { success: true };
}
