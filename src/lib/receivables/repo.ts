/**
 * 未収管理（Receivables）リポジトリ
 *
 * 現状は in-memory ストレージ（将来 DB 置換）
 */

import type {
  Receivable,
  ReceivableAction,
  ReceivableEvent,
  ReceivableStatus,
  ReceivablePriority,
  ReceivableActionType,
  ReceivableActionOutcome,
  NextActionType,
  ReceivableSubjectType,
  ViewerContext,
} from './types';
import {
  canViewReceivables,
  canEditReceivables,
  isOwnAssignmentOnly,
  calculateAgingDays,
  isOverdue,
} from './types';

// ========== ストレージ ==========

const receivablesStore = new Map<string, Receivable>();
const actionsStore = new Map<string, ReceivableAction>();
const eventsStore = new Map<string, ReceivableEvent>();

// ========== ユーティリティ ==========

function generateId(): string {
  return `recv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateActionId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ========== 監査ログ記録 ==========

function logEvent(
  receivableId: string,
  actorUserId: string,
  action: ReceivableEvent['action'],
  beforeData: Receivable | null,
  afterData: Receivable | null,
  note: string | null = null
): void {
  const event: ReceivableEvent = {
    id: generateEventId(),
    receivableId,
    actorUserId,
    action,
    beforeJson: beforeData ? JSON.stringify(beforeData) : null,
    afterJson: afterData ? JSON.stringify(afterData) : null,
    createdAt: now(),
    note,
  };
  eventsStore.set(event.id, event);
}

// ========== フィルタリング ==========

export interface ReceivableFilters {
  status?: ReceivableStatus;
  priority?: ReceivablePriority;
  overdue?: boolean;
  agingMinDays?: number;
  amountMin?: number;
  ownerUserId?: string;
  businessUnitId?: string;  // Task 049: 事業単位フィルタ
  q?: string;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

// ========== CRUD ==========

/**
 * 一覧取得
 */
export function listReceivables(
  viewer: ViewerContext,
  filters: ReceivableFilters = {},
  pagination: PaginationParams = { limit: 50, offset: 0 }
): { items: Receivable[]; total: number } {
  // 権限チェック
  const viewable = canViewReceivables(viewer.role);
  const ownOnly = isOwnAssignmentOnly(viewer.role);

  let items = Array.from(receivablesStore.values());

  // RBAC: staff/leaderは担当分のみ
  if (!viewable && ownOnly) {
    items = items.filter((r) => r.ownerUserId === viewer.userId);
  } else if (!viewable) {
    return { items: [], total: 0 };
  }

  // フィルタリング
  if (filters.status) {
    items = items.filter((r) => r.status === filters.status);
  }
  if (filters.priority) {
    items = items.filter((r) => r.priority === filters.priority);
  }
  if (filters.overdue) {
    items = items.filter((r) => isOverdue(r));
  }
  if (filters.agingMinDays !== undefined) {
    items = items.filter((r) => {
      const aging = calculateAgingDays(r.dueAt);
      return aging >= filters.agingMinDays!;
    });
  }
  if (filters.amountMin !== undefined) {
    items = items.filter((r) => r.amount >= filters.amountMin!);
  }
  if (filters.ownerUserId) {
    items = items.filter((r) => r.ownerUserId === filters.ownerUserId);
  }
  // Task 049: 事業単位フィルタ
  if (filters.businessUnitId) {
    items = items.filter((r) => r.businessUnitId === filters.businessUnitId);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    items = items.filter(
      (r) =>
        r.subjectName.toLowerCase().includes(q) ||
        (r.invoiceNo && r.invoiceNo.toLowerCase().includes(q))
    );
  }

  // agingDays を計算して更新
  items = items.map((r) => ({
    ...r,
    agingDays: isOverdue(r) ? calculateAgingDays(r.dueAt) : 0,
  }));

  // ソート: 期限超過日数（降順）、金額（降順）
  items.sort((a, b) => {
    if ((b.agingDays ?? 0) !== (a.agingDays ?? 0)) {
      return (b.agingDays ?? 0) - (a.agingDays ?? 0);
    }
    return b.amount - a.amount;
  });

  const total = items.length;
  const paged = items.slice(pagination.offset, pagination.offset + pagination.limit);

  return { items: paged, total };
}

/**
 * 詳細取得
 */
export function getById(id: string, viewer: ViewerContext): Receivable | null {
  const receivable = receivablesStore.get(id);
  if (!receivable) return null;

  // 権限チェック
  const viewable = canViewReceivables(viewer.role);
  const ownOnly = isOwnAssignmentOnly(viewer.role);

  if (!viewable && ownOnly) {
    if (receivable.ownerUserId !== viewer.userId) {
      return null;
    }
  } else if (!viewable) {
    return null;
  }

  // agingDays 更新
  return {
    ...receivable,
    agingDays: isOverdue(receivable) ? calculateAgingDays(receivable.dueAt) : 0,
  };
}

/**
 * 作成
 */
export interface CreateReceivableInput {
  subjectType: ReceivableSubjectType;
  subjectId?: string | null;
  subjectName: string;
  invoiceNo?: string | null;
  period?: string | null;
  description?: string | null;
  amount: number;
  dueAt: string;
  issuedAt?: string | null;
  priority?: ReceivablePriority;
  ownerUserId?: string | null;
  nextActionAt?: string | null;
  nextActionType?: NextActionType;
  businessUnitId?: string | null;  // Task 049: 事業単位
}

export function createReceivable(
  input: CreateReceivableInput,
  actorUserId: string
): Receivable {
  const id = generateId();
  const timestamp = now();

  const receivable: Receivable = {
    id,
    businessUnitId: input.businessUnitId ?? null,  // Task 049
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    subjectName: input.subjectName,
    invoiceNo: input.invoiceNo ?? null,
    period: input.period ?? null,
    description: input.description ?? null,
    amount: input.amount,
    currency: 'JPY',
    issuedAt: input.issuedAt ?? null,
    dueAt: input.dueAt,
    agingDays: null,
    status: 'open',
    priority: input.priority ?? 'normal',
    ownerUserId: input.ownerUserId ?? null,
    ownerRole: null,
    promisedAt: null,
    paidAmount: null,
    paidAt: null,
    riskNote: null,
    nextActionAt: input.nextActionAt ?? null,
    nextActionType: input.nextActionType ?? null,
    createdByUserId: actorUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  receivablesStore.set(id, receivable);
  logEvent(id, actorUserId, 'create', null, receivable);

  return receivable;
}

/**
 * 更新
 */
export interface UpdateReceivableInput {
  subjectName?: string;
  invoiceNo?: string | null;
  period?: string | null;
  description?: string | null;
  amount?: number;
  dueAt?: string;
  issuedAt?: string | null;
  priority?: ReceivablePriority;
  riskNote?: string | null;
  nextActionAt?: string | null;
  nextActionType?: NextActionType;
  businessUnitId?: string | null;  // Task 049: 事業単位
}

export function updateReceivable(
  id: string,
  patch: UpdateReceivableInput,
  actorUserId: string
): Receivable | null {
  const existing = receivablesStore.get(id);
  if (!existing) return null;

  const updated: Receivable = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };

  receivablesStore.set(id, updated);
  logEvent(id, actorUserId, 'update', existing, updated);

  return updated;
}

/**
 * 担当割当
 */
export function assignOwner(
  id: string,
  ownerUserId: string | null,
  actorUserId: string
): Receivable | null {
  const existing = receivablesStore.get(id);
  if (!existing) return null;

  const updated: Receivable = {
    ...existing,
    ownerUserId,
    updatedAt: now(),
  };

  receivablesStore.set(id, updated);
  logEvent(id, actorUserId, 'assign', existing, updated);

  return updated;
}

/**
 * ステータス変更
 */
export function changeStatus(
  id: string,
  status: ReceivableStatus,
  actorUserId: string
): Receivable | null {
  const existing = receivablesStore.get(id);
  if (!existing) return null;

  const updated: Receivable = {
    ...existing,
    status,
    updatedAt: now(),
  };

  receivablesStore.set(id, updated);
  logEvent(id, actorUserId, 'status_change', existing, updated);

  return updated;
}

/**
 * 完済
 */
export function markPaid(
  id: string,
  paidAt: string,
  actorUserId: string
): Receivable | null {
  const existing = receivablesStore.get(id);
  if (!existing) return null;

  const updated: Receivable = {
    ...existing,
    status: 'paid',
    paidAt,
    paidAmount: existing.amount,
    updatedAt: now(),
  };

  receivablesStore.set(id, updated);
  logEvent(id, actorUserId, 'mark_paid', existing, updated);

  return updated;
}

/**
 * 貸倒
 */
export function writeOff(
  id: string,
  note: string | null,
  actorUserId: string
): Receivable | null {
  const existing = receivablesStore.get(id);
  if (!existing) return null;

  const updated: Receivable = {
    ...existing,
    status: 'writeoff',
    riskNote: note ?? existing.riskNote,
    updatedAt: now(),
  };

  receivablesStore.set(id, updated);
  logEvent(id, actorUserId, 'writeoff', existing, updated, note);

  return updated;
}

// ========== アクションログ ==========

export interface AddActionInput {
  actionType: ReceivableActionType;
  occurredAt?: string;
  summary: string;
  detail?: string | null;
  outcome?: ReceivableActionOutcome;
  promisedAt?: string | null;
  amountPaid?: number | null;
  nextActionAt?: string | null;
}

/**
 * アクション追加
 */
export function addAction(
  receivableId: string,
  input: AddActionInput,
  actorUserId: string
): ReceivableAction | null {
  const receivable = receivablesStore.get(receivableId);
  if (!receivable) return null;

  const actionId = generateActionId();
  const timestamp = now();

  const action: ReceivableAction = {
    id: actionId,
    receivableId,
    actionType: input.actionType,
    occurredAt: input.occurredAt ?? timestamp,
    actorUserId,
    summary: input.summary,
    detail: input.detail ?? null,
    outcome: input.outcome ?? null,
    promisedAt: input.promisedAt ?? null,
    amountPaid: input.amountPaid ?? null,
    nextActionAt: input.nextActionAt ?? null,
    note: null,
    createdAt: timestamp,
  };

  actionsStore.set(actionId, action);

  // receivable の整合性更新
  const updates: Partial<Receivable> = {
    updatedAt: timestamp,
  };

  if (input.nextActionAt) {
    updates.nextActionAt = input.nextActionAt;
  }

  if (input.outcome === 'promised' && input.promisedAt) {
    updates.promisedAt = input.promisedAt;
    updates.status = 'promised';
  }

  if (input.outcome === 'partial_paid' && input.amountPaid) {
    updates.paidAmount = (receivable.paidAmount ?? 0) + input.amountPaid;
    updates.status = 'partial';
  }

  if (input.outcome === 'paid') {
    updates.status = 'paid';
    updates.paidAt = today();
    updates.paidAmount = receivable.amount;
  }

  if (input.outcome === 'disputed') {
    updates.status = 'disputed';
  }

  const updated = { ...receivable, ...updates };
  receivablesStore.set(receivableId, updated);
  logEvent(receivableId, actorUserId, 'add_action', receivable, updated);

  return action;
}

/**
 * アクションログ取得
 */
export function getActions(
  receivableId: string,
  limit: number = 50,
  offset: number = 0
): { actions: ReceivableAction[]; total: number } {
  const actions = Array.from(actionsStore.values())
    .filter((a) => a.receivableId === receivableId)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const total = actions.length;
  const paged = actions.slice(offset, offset + limit);

  return { actions: paged, total };
}

// ========== 監査ログ取得 ==========

export function getEvents(
  receivableId: string,
  limit: number = 50,
  offset: number = 0
): { events: ReceivableEvent[]; total: number } {
  const events = Array.from(eventsStore.values())
    .filter((e) => e.receivableId === receivableId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = events.length;
  const paged = events.slice(offset, offset + limit);

  return { events: paged, total };
}

// ========== 統計 ==========

export interface ReceivableStats {
  openTotal: number;
  overdueTotal: number;
  overdueCount: number;
  criticalOverdueCount: number;
  aging60Count: number;        // Task 049: 60日超の件数
  countByStatus: Record<ReceivableStatus, number>;
  agingBuckets: {
    '1-30': number;
    '31-60': number;
    '61-90': number;
    '90+': number;
  };
  totalAmount: number;
}

// Task 049: 統計フィルタオプション
export interface StatsFilterOptions {
  businessUnitId?: string;
}

export function getStats(viewer: ViewerContext, options: StatsFilterOptions = {}): ReceivableStats | null {
  if (!canViewReceivables(viewer.role)) {
    return null;
  }

  let items = Array.from(receivablesStore.values());

  // Task 049: 事業単位フィルタ
  if (options.businessUnitId) {
    items = items.filter((r) => r.businessUnitId === options.businessUnitId);
  }

  const openItems = items.filter((r) => !['paid', 'writeoff', 'archived'].includes(r.status));
  const overdueItems = items.filter((r) => isOverdue(r));

  const countByStatus: Record<ReceivableStatus, number> = {
    open: 0,
    in_collection: 0,
    promised: 0,
    partial: 0,
    disputed: 0,
    paid: 0,
    writeoff: 0,
    archived: 0,
  };

  items.forEach((r) => {
    countByStatus[r.status]++;
  });

  const agingBuckets = {
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  };

  // Task 049: 60日超の件数をカウント
  let aging60Count = 0;

  overdueItems.forEach((r) => {
    const aging = calculateAgingDays(r.dueAt);
    if (aging <= 30) {
      agingBuckets['1-30'] += r.amount;
    } else if (aging <= 60) {
      agingBuckets['31-60'] += r.amount;
    } else if (aging <= 90) {
      agingBuckets['61-90'] += r.amount;
      aging60Count++;  // Task 049
    } else {
      agingBuckets['90+'] += r.amount;
      aging60Count++;  // Task 049
    }
  });

  return {
    openTotal: openItems.reduce((sum, r) => sum + r.amount, 0),
    overdueTotal: overdueItems.reduce((sum, r) => sum + r.amount, 0),
    overdueCount: overdueItems.length,
    criticalOverdueCount: overdueItems.filter((r) => r.priority === 'critical').length,
    aging60Count,  // Task 049
    countByStatus,
    agingBuckets,
    totalAmount: items.reduce((sum, r) => sum + r.amount, 0),
  };
}

// ========== リスクスキャン ==========

export interface ReceivableRisk {
  receivable: Receivable;
  riskType: 'overdue' | 'high_amount' | 'long_aging';
  agingDays: number;
}

export function scanReceivableRisks(): ReceivableRisk[] {
  const risks: ReceivableRisk[] = [];
  const items = Array.from(receivablesStore.values());

  items.forEach((r) => {
    if (['paid', 'writeoff', 'archived'].includes(r.status)) {
      return;
    }

    const aging = calculateAgingDays(r.dueAt);
    const overdue = isOverdue(r);

    // 高額 + 期限超過
    if (overdue && r.amount >= 100000) {
      risks.push({
        receivable: r,
        riskType: 'high_amount',
        agingDays: aging,
      });
    }
    // 長期滞留（60日以上）
    else if (aging >= 60) {
      risks.push({
        receivable: r,
        riskType: 'long_aging',
        agingDays: aging,
      });
    }
    // 通常の期限超過
    else if (overdue) {
      risks.push({
        receivable: r,
        riskType: 'overdue',
        agingDays: aging,
      });
    }
  });

  // リスク順にソート（金額降順）
  risks.sort((a, b) => b.receivable.amount - a.receivable.amount);

  return risks;
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (receivablesStore.size > 0) return;

  const demoReceivables: Omit<Receivable, 'agingDays'>[] = [
    {
      id: 'recv_demo_001',
      businessUnitId: 'bu_001',  // Task 049: 西淀川
      subjectType: 'client',
      subjectId: 'resident_001',
      subjectName: '山田太郎',
      invoiceNo: 'INV-2026-001',
      period: '2025-12',
      description: '12月分利用料',
      amount: 185000,
      currency: 'JPY',
      issuedAt: '2026-01-05',
      dueAt: '2026-01-25',
      status: 'open',
      priority: 'critical',
      ownerUserId: 'user_manager',
      ownerRole: 'manager',
      promisedAt: null,
      paidAmount: null,
      paidAt: null,
      riskNote: '複数月滞納リスク',
      nextActionAt: '2026-02-03',
      nextActionType: 'call',
      createdByUserId: 'system',
      createdAt: '2026-01-05T09:00:00Z',
      updatedAt: '2026-01-30T10:00:00Z',
    },
    {
      id: 'recv_demo_002',
      businessUnitId: 'bu_001',  // Task 049: 西淀川
      subjectType: 'client',
      subjectId: 'resident_002',
      subjectName: '鈴木花子',
      invoiceNo: 'INV-2026-002',
      period: '2026-01',
      description: '1月分利用料',
      amount: 165000,
      currency: 'JPY',
      issuedAt: '2026-01-05',
      dueAt: '2026-01-31',
      status: 'promised',
      priority: 'high',
      ownerUserId: 'user_manager',
      ownerRole: 'manager',
      promisedAt: '2026-02-10',
      paidAmount: null,
      paidAt: null,
      riskNote: null,
      nextActionAt: '2026-02-10',
      nextActionType: 'call',
      createdByUserId: 'system',
      createdAt: '2026-01-05T09:00:00Z',
      updatedAt: '2026-01-28T14:00:00Z',
    },
    {
      id: 'recv_demo_003',
      businessUnitId: 'bu_003',  // Task 049: サ高住さくら
      subjectType: 'company',
      subjectId: 'company_001',
      subjectName: '株式会社ABC福祉',
      invoiceNo: 'INV-2026-003',
      period: '2025-11',
      description: '委託費（11月分）',
      amount: 450000,
      currency: 'JPY',
      issuedAt: '2025-12-01',
      dueAt: '2025-12-20',
      status: 'in_collection',
      priority: 'critical',
      ownerUserId: 'user_manager',
      ownerRole: 'manager',
      promisedAt: null,
      paidAmount: null,
      paidAt: null,
      riskNote: '担当者不在続き、経理に直接連絡予定',
      nextActionAt: '2026-02-05',
      nextActionType: 'email',
      createdByUserId: 'system',
      createdAt: '2025-12-01T09:00:00Z',
      updatedAt: '2026-01-20T11:00:00Z',
    },
    {
      id: 'recv_demo_004',
      businessUnitId: 'bu_002',  // Task 049: 東淀川
      subjectType: 'client',
      subjectId: 'resident_003',
      subjectName: '佐藤一郎',
      invoiceNo: 'INV-2026-004',
      period: '2026-01',
      description: '1月分利用料',
      amount: 155000,
      currency: 'JPY',
      issuedAt: '2026-01-05',
      dueAt: '2026-02-10',
      status: 'open',
      priority: 'normal',
      ownerUserId: null,
      ownerRole: null,
      promisedAt: null,
      paidAmount: null,
      paidAt: null,
      riskNote: null,
      nextActionAt: null,
      nextActionType: null,
      createdByUserId: 'system',
      createdAt: '2026-01-05T09:00:00Z',
      updatedAt: '2026-01-05T09:00:00Z',
    },
    {
      id: 'recv_demo_005',
      businessUnitId: 'bu_004',  // Task 049: 老人ホーム
      subjectType: 'client',
      subjectId: 'resident_004',
      subjectName: '田中美咲',
      invoiceNo: 'INV-2025-120',
      period: '2025-10',
      description: '10月分利用料',
      amount: 178000,
      currency: 'JPY',
      issuedAt: '2025-11-01',
      dueAt: '2025-11-30',
      status: 'partial',
      priority: 'high',
      ownerUserId: 'user_manager',
      ownerRole: 'manager',
      promisedAt: '2026-02-15',
      paidAmount: 100000,
      paidAt: null,
      riskNote: '分割払い対応中',
      nextActionAt: '2026-02-15',
      nextActionType: 'call',
      createdByUserId: 'system',
      createdAt: '2025-11-01T09:00:00Z',
      updatedAt: '2026-01-15T16:00:00Z',
    },
    {
      id: 'recv_demo_006',
      businessUnitId: null,  // Task 049: 未分類
      subjectType: 'other',
      subjectId: null,
      subjectName: '個人（紹介料）',
      invoiceNo: null,
      period: null,
      description: '紹介手数料',
      amount: 50000,
      currency: 'JPY',
      issuedAt: '2025-12-15',
      dueAt: '2026-01-15',
      status: 'disputed',
      priority: 'normal',
      ownerUserId: 'user_manager',
      ownerRole: 'manager',
      promisedAt: null,
      paidAmount: null,
      paidAt: null,
      riskNote: '金額に異議あり、確認中',
      nextActionAt: '2026-02-07',
      nextActionType: 'email',
      createdByUserId: 'system',
      createdAt: '2025-12-15T09:00:00Z',
      updatedAt: '2026-01-20T10:00:00Z',
    },
  ];

  demoReceivables.forEach((r) => {
    receivablesStore.set(r.id, { ...r, agingDays: null });
  });

  // デモアクションログ
  const demoActions: ReceivableAction[] = [
    {
      id: 'act_demo_001',
      receivableId: 'recv_demo_001',
      actionType: 'call',
      occurredAt: '2026-01-28T10:00:00Z',
      actorUserId: 'user_manager',
      summary: '電話連絡、不在',
      detail: '留守電にメッセージを残した',
      outcome: 'no_answer',
      promisedAt: null,
      amountPaid: null,
      nextActionAt: '2026-02-03',
      note: null,
      createdAt: '2026-01-28T10:05:00Z',
    },
    {
      id: 'act_demo_002',
      receivableId: 'recv_demo_002',
      actionType: 'call',
      occurredAt: '2026-01-28T14:00:00Z',
      actorUserId: 'user_manager',
      summary: '電話連絡、2/10支払約束',
      detail: '次回給料日に支払うとのこと',
      outcome: 'promised',
      promisedAt: '2026-02-10',
      amountPaid: null,
      nextActionAt: '2026-02-10',
      note: null,
      createdAt: '2026-01-28T14:10:00Z',
    },
    {
      id: 'act_demo_003',
      receivableId: 'recv_demo_003',
      actionType: 'email',
      occurredAt: '2026-01-20T11:00:00Z',
      actorUserId: 'user_manager',
      summary: 'メール督促送付',
      detail: '経理部宛に督促メールを送信',
      outcome: 'other',
      promisedAt: null,
      amountPaid: null,
      nextActionAt: '2026-02-05',
      note: null,
      createdAt: '2026-01-20T11:05:00Z',
    },
    {
      id: 'act_demo_004',
      receivableId: 'recv_demo_005',
      actionType: 'call',
      occurredAt: '2026-01-15T16:00:00Z',
      actorUserId: 'user_manager',
      summary: '一部入金確認、残額は2/15予定',
      detail: '10万円の入金を確認。残り78,000円は2/15に支払うとのこと',
      outcome: 'partial_paid',
      promisedAt: '2026-02-15',
      amountPaid: 100000,
      nextActionAt: '2026-02-15',
      note: null,
      createdAt: '2026-01-15T16:10:00Z',
    },
  ];

  demoActions.forEach((a) => {
    actionsStore.set(a.id, a);
  });
}

// 初期化
initDemoData();
