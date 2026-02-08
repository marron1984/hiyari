/**
 * 承認フローリポジトリ
 *
 * インメモリストレージ（本番ではDBに置き換え）
 * フロー定義とステップの管理
 */

import type {
  ApprovalFlow,
  ApprovalFlowStep,
  CreateApprovalFlowRequest,
  UpdateApprovalFlowRequest,
  CreateApprovalFlowStepRequest,
  UpdateApprovalFlowStepRequest,
  ApprovalFlowFilter,
  FlowStatus,
} from './types';
import { guardDemoSeed } from '@/config/runtimeFlags';

// インメモリストレージ
const flowsStore = new Map<string, ApprovalFlow>();
const stepsStore = new Map<string, ApprovalFlowStep>();

// 初期化フラグ
let isInitialized = false;

// ID生成用カウンター
let flowIdCounter = 1;
let stepIdCounter = 1;

function generateFlowId(): string {
  return `flow_${String(flowIdCounter++).padStart(3, '0')}`;
}

function generateStepId(): string {
  return `step_${String(stepIdCounter++).padStart(4, '0')}`;
}

/**
 * デモデータで初期化（本番では空ストアのまま）
 */
function initializeStore(): void {
  if (isInitialized) return;
  isInitialized = true;

  if (!guardDemoSeed('flowRepo.initializeStore')) return;

  const now = new Date().toISOString();

  // 経費申請フロー（〜5万円）
  const expenseFlowSmall: ApprovalFlow = {
    id: generateFlowId(),
    name: '経費申請フロー（5万円以下）',
    requestType: 'expense',
    status: 'published',
    version: 1,
    description: '5万円以下の経費申請。マネージャー承認のみ。',
    conditionJson: { minAmount: 0, maxAmount: 50000 },
    steps: [],
    createdAt: now,
    updatedAt: now,
  };

  // ステップ追加：マネージャー
  const step1: ApprovalFlowStep = {
    id: generateStepId(),
    flowId: expenseFlowSmall.id,
    stepOrder: 1,
    approverType: 'role',
    approverRole: 'manager',
    approverUserId: null,
    required: 'any',
    createdAt: now,
    updatedAt: now,
  };
  stepsStore.set(step1.id, step1);
  expenseFlowSmall.steps = [step1];
  flowsStore.set(expenseFlowSmall.id, expenseFlowSmall);

  // 経費申請フロー（5万円超）
  const expenseFlowLarge: ApprovalFlow = {
    id: generateFlowId(),
    name: '経費申請フロー（5万円超）',
    requestType: 'expense',
    status: 'published',
    version: 1,
    description: '5万円を超える経費申請。マネージャー→役員の2段階承認。',
    conditionJson: { minAmount: 50001 },
    steps: [],
    createdAt: now,
    updatedAt: now,
  };

  const step2: ApprovalFlowStep = {
    id: generateStepId(),
    flowId: expenseFlowLarge.id,
    stepOrder: 1,
    approverType: 'role',
    approverRole: 'manager',
    approverUserId: null,
    required: 'any',
    createdAt: now,
    updatedAt: now,
  };
  const step3: ApprovalFlowStep = {
    id: generateStepId(),
    flowId: expenseFlowLarge.id,
    stepOrder: 2,
    approverType: 'role',
    approverRole: 'executive',
    approverUserId: null,
    required: 'any',
    createdAt: now,
    updatedAt: now,
  };
  stepsStore.set(step2.id, step2);
  stepsStore.set(step3.id, step3);
  expenseFlowLarge.steps = [step2, step3];
  flowsStore.set(expenseFlowLarge.id, expenseFlowLarge);

  // 残業申請フロー
  const overtimeFlow: ApprovalFlow = {
    id: generateFlowId(),
    name: '残業申請フロー',
    requestType: 'overtime',
    status: 'published',
    version: 1,
    description: '残業申請。マネージャー承認のみ。',
    conditionJson: null,
    steps: [],
    createdAt: now,
    updatedAt: now,
  };

  const step4: ApprovalFlowStep = {
    id: generateStepId(),
    flowId: overtimeFlow.id,
    stepOrder: 1,
    approverType: 'role',
    approverRole: 'manager',
    approverUserId: null,
    required: 'any',
    createdAt: now,
    updatedAt: now,
  };
  stepsStore.set(step4.id, step4);
  overtimeFlow.steps = [step4];
  flowsStore.set(overtimeFlow.id, overtimeFlow);

  // 汎用フロー
  const genericFlow: ApprovalFlow = {
    id: generateFlowId(),
    name: '汎用承認フロー',
    requestType: 'generic',
    status: 'published',
    version: 1,
    description: 'その他の申請。マネージャー→役員の2段階承認。',
    conditionJson: null,
    steps: [],
    createdAt: now,
    updatedAt: now,
  };

  const step5: ApprovalFlowStep = {
    id: generateStepId(),
    flowId: genericFlow.id,
    stepOrder: 1,
    approverType: 'role',
    approverRole: 'manager',
    approverUserId: null,
    required: 'any',
    createdAt: now,
    updatedAt: now,
  };
  const step6: ApprovalFlowStep = {
    id: generateStepId(),
    flowId: genericFlow.id,
    stepOrder: 2,
    approverType: 'role',
    approverRole: 'executive',
    approverUserId: null,
    required: 'any',
    createdAt: now,
    updatedAt: now,
  };
  stepsStore.set(step5.id, step5);
  stepsStore.set(step6.id, step6);
  genericFlow.steps = [step5, step6];
  flowsStore.set(genericFlow.id, genericFlow);

  // Task 040: 外部共有発行承認フロー
  const shareIssueFlow: ApprovalFlow = {
    id: generateFlowId(),
    name: '外部共有発行承認フロー',
    requestType: 'share_issue',
    status: 'published',
    version: 1,
    description: '外部共有リンクの発行承認。マネージャー→役員の2段階承認。',
    conditionJson: null,
    steps: [],
    createdAt: now,
    updatedAt: now,
  };

  const shareStep1: ApprovalFlowStep = {
    id: generateStepId(),
    flowId: shareIssueFlow.id,
    stepOrder: 1,
    approverType: 'role',
    approverRole: 'manager',
    approverUserId: null,
    required: 'any',
    createdAt: now,
    updatedAt: now,
  };
  const shareStep2: ApprovalFlowStep = {
    id: generateStepId(),
    flowId: shareIssueFlow.id,
    stepOrder: 2,
    approverType: 'role',
    approverRole: 'executive',
    approverUserId: null,
    required: 'any',
    createdAt: now,
    updatedAt: now,
  };
  stepsStore.set(shareStep1.id, shareStep1);
  stepsStore.set(shareStep2.id, shareStep2);
  shareIssueFlow.steps = [shareStep1, shareStep2];
  flowsStore.set(shareIssueFlow.id, shareIssueFlow);
}

// ========================================
// フロー操作
// ========================================

/**
 * フロー一覧取得
 */
export function listApprovalFlows(filter: ApprovalFlowFilter = {}): {
  flows: ApprovalFlow[];
  total: number;
} {
  initializeStore();

  let flows = Array.from(flowsStore.values());

  // フィルタ
  if (filter.requestType) {
    flows = flows.filter((f) => f.requestType === filter.requestType);
  }
  if (filter.status) {
    flows = flows.filter((f) => f.status === filter.status);
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
export function getApprovalFlow(flowId: string): ApprovalFlow | null {
  initializeStore();
  return flowsStore.get(flowId) ?? null;
}

/**
 * フロー作成（draft）
 */
export function createApprovalFlow(
  data: CreateApprovalFlowRequest
): { success: boolean; flow?: ApprovalFlow; error?: string } {
  initializeStore();

  const now = new Date().toISOString();
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
    createdAt: now,
    updatedAt: now,
  };

  // ステップがあれば追加
  if (data.steps && data.steps.length > 0) {
    for (const stepData of data.steps) {
      const step: ApprovalFlowStep = {
        id: generateStepId(),
        flowId,
        stepOrder: stepData.stepOrder,
        approverType: stepData.approverType,
        approverRole: stepData.approverRole ?? null,
        approverUserId: stepData.approverUserId ?? null,
        required: stepData.required ?? 'any',
        createdAt: now,
        updatedAt: now,
      };
      stepsStore.set(step.id, step);
      flow.steps.push(step);
    }
    flow.steps.sort((a, b) => a.stepOrder - b.stepOrder);
  }

  flowsStore.set(flowId, flow);

  return { success: true, flow };
}

/**
 * フロー更新（draftのみ）
 */
export function updateApprovalFlow(
  flowId: string,
  data: UpdateApprovalFlowRequest
): { success: boolean; flow?: ApprovalFlow; error?: string } {
  initializeStore();

  const existing = flowsStore.get(flowId);
  if (!existing) {
    return { success: false, error: 'フローが見つかりません' };
  }

  if (existing.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ編集可能です' };
  }

  const now = new Date().toISOString();
  const updated: ApprovalFlow = {
    ...existing,
    name: data.name ?? existing.name,
    description: data.description !== undefined ? data.description : existing.description,
    conditionJson: data.conditionJson !== undefined ? data.conditionJson : existing.conditionJson,
    updatedAt: now,
  };

  flowsStore.set(flowId, updated);

  return { success: true, flow: updated };
}

/**
 * フロー公開（draft → published, version++）
 */
export function publishApprovalFlow(flowId: string): {
  success: boolean;
  flow?: ApprovalFlow;
  error?: string;
} {
  initializeStore();

  const existing = flowsStore.get(flowId);
  if (!existing) {
    return { success: false, error: 'フローが見つかりません' };
  }

  if (existing.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ公開可能です' };
  }

  if (existing.steps.length === 0) {
    return { success: false, error: '承認ステップが設定されていません' };
  }

  const now = new Date().toISOString();
  const published: ApprovalFlow = {
    ...existing,
    status: 'published',
    version: existing.version + 1,
    updatedAt: now,
  };

  flowsStore.set(flowId, published);

  return { success: true, flow: published };
}

/**
 * フローアーカイブ（published → archived）
 */
export function archiveApprovalFlow(flowId: string): {
  success: boolean;
  flow?: ApprovalFlow;
  error?: string;
} {
  initializeStore();

  const existing = flowsStore.get(flowId);
  if (!existing) {
    return { success: false, error: 'フローが見つかりません' };
  }

  if (existing.status === 'archived') {
    return { success: false, error: '既にアーカイブ済みです' };
  }

  const now = new Date().toISOString();
  const archived: ApprovalFlow = {
    ...existing,
    status: 'archived',
    updatedAt: now,
  };

  flowsStore.set(flowId, archived);

  return { success: true, flow: archived };
}

// ========================================
// ステップ操作
// ========================================

/**
 * ステップ追加
 */
export function addFlowStep(
  flowId: string,
  data: CreateApprovalFlowStepRequest
): { success: boolean; step?: ApprovalFlowStep; error?: string } {
  initializeStore();

  const flow = flowsStore.get(flowId);
  if (!flow) {
    return { success: false, error: 'フローが見つかりません' };
  }

  if (flow.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ編集可能です' };
  }

  const now = new Date().toISOString();
  const step: ApprovalFlowStep = {
    id: generateStepId(),
    flowId,
    stepOrder: data.stepOrder,
    approverType: data.approverType,
    approverRole: data.approverRole ?? null,
    approverUserId: data.approverUserId ?? null,
    required: data.required ?? 'any',
    createdAt: now,
    updatedAt: now,
  };

  stepsStore.set(step.id, step);
  flow.steps.push(step);
  flow.steps.sort((a, b) => a.stepOrder - b.stepOrder);
  flow.updatedAt = now;
  flowsStore.set(flowId, flow);

  return { success: true, step };
}

/**
 * ステップ更新
 */
export function updateFlowStep(
  stepId: string,
  data: UpdateApprovalFlowStepRequest
): { success: boolean; step?: ApprovalFlowStep; error?: string } {
  initializeStore();

  const existing = stepsStore.get(stepId);
  if (!existing) {
    return { success: false, error: 'ステップが見つかりません' };
  }

  const flow = flowsStore.get(existing.flowId);
  if (!flow) {
    return { success: false, error: 'フローが見つかりません' };
  }

  if (flow.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ編集可能です' };
  }

  const now = new Date().toISOString();
  const updated: ApprovalFlowStep = {
    ...existing,
    stepOrder: data.stepOrder ?? existing.stepOrder,
    approverType: data.approverType ?? existing.approverType,
    approverRole: data.approverRole !== undefined ? data.approverRole : existing.approverRole,
    approverUserId: data.approverUserId !== undefined ? data.approverUserId : existing.approverUserId,
    required: data.required ?? existing.required,
    updatedAt: now,
  };

  stepsStore.set(stepId, updated);

  // フロー内のステップも更新
  const stepIndex = flow.steps.findIndex((s) => s.id === stepId);
  if (stepIndex >= 0) {
    flow.steps[stepIndex] = updated;
    flow.steps.sort((a, b) => a.stepOrder - b.stepOrder);
  }
  flow.updatedAt = now;
  flowsStore.set(existing.flowId, flow);

  return { success: true, step: updated };
}

/**
 * ステップ削除
 */
export function removeFlowStep(stepId: string): {
  success: boolean;
  error?: string;
} {
  initializeStore();

  const existing = stepsStore.get(stepId);
  if (!existing) {
    return { success: false, error: 'ステップが見つかりません' };
  }

  const flow = flowsStore.get(existing.flowId);
  if (!flow) {
    return { success: false, error: 'フローが見つかりません' };
  }

  if (flow.status !== 'draft') {
    return { success: false, error: 'draftステータスのフローのみ編集可能です' };
  }

  const now = new Date().toISOString();
  stepsStore.delete(stepId);

  flow.steps = flow.steps.filter((s) => s.id !== stepId);
  flow.updatedAt = now;
  flowsStore.set(existing.flowId, flow);

  return { success: true };
}

/**
 * ストアクリア（テスト用）
 */
export function clearApprovalFlowsStore(): void {
  flowsStore.clear();
  stepsStore.clear();
  isInitialized = false;
  flowIdCounter = 1;
  stepIdCounter = 1;
}
