/**
 * チケット管理リポジトリ
 *
 * インメモリストア実装（本番ではDBに置き換え）
 */

import type {
  Ticket,
  TicketComment,
  TicketEvent,
  TicketWatcher,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  TicketEventAction,
  CreateTicketRequest,
  UpdateTicketRequest,
  TicketListFilter,
  TicketStats,
  ViewerContext,
  VacancyInquiryStage,
  VacancyInquiryStats,
} from './types';
import {
  canViewTicket,
  canUpdateTicket,
  canAssignTicket,
  canForceCloseTicket,
  VACANCY_INQUIRY_SLA_MS,
} from './types';

// ========== インメモリストア ==========

const ticketsStore = new Map<string, Ticket>();
const commentsStore = new Map<string, TicketComment>();
const eventsStore = new Map<string, TicketEvent>();
const watchersStore = new Map<string, TicketWatcher>();

let ticketIdCounter = 1;
let commentIdCounter = 1;
let eventIdCounter = 1;
let watcherIdCounter = 1;

// ========== デモユーザーマスタ ==========

const DEMO_USERS: Record<string, { id: string; name: string }> = {
  user_001: { id: 'user_001', name: '山田太郎' },
  user_002: { id: 'user_002', name: '佐藤次郎' },
  user_003: { id: 'user_003', name: '鈴木花子' },
  user_004: { id: 'user_004', name: '高橋三郎' },
  user_005: { id: 'user_005', name: '田中美咲' },
};

// ========== ヘルパー関数 ==========

function generateTicketId(): string {
  return `ticket_${String(ticketIdCounter++).padStart(4, '0')}`;
}

function generateCommentId(): string {
  return `tc_${String(commentIdCounter++).padStart(5, '0')}`;
}

function generateEventId(): string {
  return `te_${String(eventIdCounter++).padStart(5, '0')}`;
}

function generateWatcherId(): string {
  return `tw_${String(watcherIdCounter++).padStart(5, '0')}`;
}

function getUserName(userId: string): string {
  return DEMO_USERS[userId]?.name ?? userId;
}

function isOverdue(ticket: Ticket): boolean {
  if (!ticket.dueAt) return false;
  if (['resolved', 'closed', 'archived'].includes(ticket.status)) return false;
  return new Date(ticket.dueAt) < new Date();
}

/**
 * Ticket 071: SLA超過チェック
 */
function isSlaBreached(ticket: Ticket): boolean {
  if (!ticket.slaDueAt) return false;
  if (ticket.stage !== 'new') return false;  // newステージのみSLA適用
  return new Date(ticket.slaDueAt) < new Date();
}

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

// ========== イベント記録 ==========

function recordEvent(
  ticketId: string,
  action: TicketEventAction,
  actorUserId: string | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  note: string | null = null
): TicketEvent {
  const event: TicketEvent = {
    id: generateEventId(),
    ticketId,
    actorUserId,
    actorUserName: actorUserId ? getUserName(actorUserId) : null,
    action,
    beforeJson: before,
    afterJson: after,
    createdAt: new Date().toISOString(),
    note,
  };
  eventsStore.set(event.id, event);
  return event;
}

// ========== チケット一覧 ==========

export function listTickets(
  filter: TicketListFilter,
  viewer: ViewerContext
): { items: Ticket[]; total: number } {
  let tickets = Array.from(ticketsStore.values());

  // RBAC：staff/leaderは関係者のみ
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    tickets = tickets.filter((t) => canViewTicket(t, viewer));
  }

  // Task 030: 事業単位フィルタ
  if (filter.businessUnitId !== undefined) {
    if (filter.businessUnitId === null) {
      // 未分類（businessUnitId = null）のみ
      tickets = tickets.filter((t) => t.businessUnitId === null);
    } else {
      // 特定の事業単位
      tickets = tickets.filter((t) => t.businessUnitId === filter.businessUnitId);
    }
  }

  // ステータスフィルタ
  if (filter.status) {
    tickets = tickets.filter((t) => t.status === filter.status);
  }

  // 優先度フィルタ
  if (filter.priority) {
    tickets = tickets.filter((t) => t.priority === filter.priority);
  }

  // カテゴリフィルタ
  if (filter.category) {
    tickets = tickets.filter((t) => t.category === filter.category);
  }

  // 検索
  if (filter.q) {
    const q = filter.q.toLowerCase();
    tickets = tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }

  // myフィルタ
  if (filter.my === 'assigned') {
    tickets = tickets.filter((t) => t.assigneeUserId === viewer.userId);
  } else if (filter.my === 'requested') {
    tickets = tickets.filter((t) => t.requesterUserId === viewer.userId);
  } else if (filter.my === 'watching') {
    const watchingIds = new Set(
      Array.from(watchersStore.values())
        .filter((w) => w.userId === viewer.userId)
        .map((w) => w.ticketId)
    );
    tickets = tickets.filter((t) => watchingIds.has(t.id));
  }

  // 期限超過フィルタ
  if (filter.overdue) {
    tickets = tickets.filter(isOverdue);
  }

  // Ticket 071: relatedType フィルタ
  if (filter.relatedType !== undefined) {
    tickets = tickets.filter((t) => t.relatedType === filter.relatedType);
  }

  // Ticket 071: pipeline フィルタ
  if (filter.pipeline !== undefined) {
    tickets = tickets.filter((t) => t.pipeline === filter.pipeline);
  }

  // Ticket 071: stage フィルタ
  if (filter.stage !== undefined) {
    tickets = tickets.filter((t) => t.stage === filter.stage);
  }

  // Ticket 071: SLA超過フィルタ
  if (filter.slaBreached) {
    tickets = tickets.filter(isSlaBreached);
  }

  // ソート：priority（urgent優先）→ updatedAt降順
  const priorityOrder: Record<TicketPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  tickets.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const total = tickets.length;

  // ページネーション
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  tickets = tickets.slice(offset, offset + limit);

  return { items: tickets, total };
}

// ========== チケット詳細取得 ==========

export function getTicketById(
  id: string,
  viewer: ViewerContext
): { success: true; ticket: Ticket } | { success: false; error: string } {
  const ticket = ticketsStore.get(id);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  if (!canViewTicket(ticket, viewer)) {
    return { success: false, error: 'このチケットを閲覧する権限がありません' };
  }

  return { success: true, ticket };
}

/**
 * Task 043: チケット取得（内部用、権限チェックなし）
 * AI-VPチケット生成などシステム処理で使用
 */
export function getTicketByIdInternal(id: string): Ticket | null {
  return ticketsStore.get(id) ?? null;
}

// ========== チケット作成 ==========

import {
  tryAutoAssign,
  addToUnassignedQueue,
  removeFromUnassignedQueue,
} from '@/lib/assignment/autoAssign';

export function createTicket(
  input: CreateTicketRequest,
  actorUserId: string,
  options: { skipAutoAssign?: boolean } = {}
): Ticket {
  const now = new Date().toISOString();
  const ticketId = generateTicketId();

  // Task 057: 自動担当者割当
  let assigneeUserId: string | null = null;
  let assigneeUserName: string | null = null;

  if (!options.skipAutoAssign) {
    const assignResult = tryAutoAssign({
      entityType: 'ticket',
      entityId: ticketId,
      businessUnitId: input.businessUnitId ?? null,
      category: input.category ?? 'general',
      priority: input.priority ?? 'normal',
      createdByUserId: actorUserId,
      location: input.location ?? null,
    });

    if (assignResult.ok && assignResult.wasAssigned) {
      assigneeUserId = assignResult.assigneeUserId;
      assigneeUserName = getUserName(assignResult.assigneeUserId);
    } else if (!assignResult.ok) {
      // 未割当キューに追加
      addToUnassignedQueue(
        'ticket',
        ticketId,
        input.businessUnitId ?? null,
        assignResult.reason,
        actorUserId
      );
    }
  }

  // Ticket 071: パイプライン属性の決定
  const pipeline = input.pipeline ?? (input.relatedType === 'vacancy_inquiry' ? 'vacancy_inquiry' : null);
  const stage = input.stage ?? (pipeline === 'vacancy_inquiry' ? 'new' : null);

  // Ticket 071: vacancy_inquiryの場合、自動でSLA期限を設定
  let slaDueAt = input.slaDueAt ?? null;
  if (pipeline === 'vacancy_inquiry' && stage === 'new' && !slaDueAt) {
    slaDueAt = new Date(Date.now() + VACANCY_INQUIRY_SLA_MS).toISOString();
  }

  const ticket: Ticket = {
    id: ticketId,
    title: input.title,
    description: input.description,
    status: 'open',
    priority: input.priority ?? 'normal',
    category: input.category ?? 'general',
    businessUnitId: input.businessUnitId ?? null,  // Task 030
    requesterUserId: actorUserId,
    requesterUserName: getUserName(actorUserId),
    assigneeUserId,
    assigneeUserName,
    assigneeRole: null,
    dueAt: input.dueAt ?? null,
    resolvedAt: null,
    closedAt: null,
    tagsJson: input.tags ?? null,
    metaJson: input.meta ?? null,                  // Ticket 074: メタデータ
    relatedType: input.relatedType ?? null,
    relatedId: input.relatedId ?? null,
    location: input.location ?? null,
    // Ticket 071: パイプライン属性
    pipeline,
    stage,
    slaDueAt,
    stageChangedAt: pipeline ? now : null,
    createdAt: now,
    updatedAt: now,
  };

  ticketsStore.set(ticket.id, ticket);

  // イベント記録
  recordEvent(ticket.id, 'create', actorUserId, null, {
    title: ticket.title,
    priority: ticket.priority,
    category: ticket.category,
    businessUnitId: ticket.businessUnitId,  // Task 030
    assigneeUserId: ticket.assigneeUserId,  // Task 057
  }, null);

  // requesterを自動watch
  addWatcher(ticket.id, actorUserId);

  return ticket;
}

// ========== チケット更新 ==========

export function updateTicket(
  id: string,
  patch: UpdateTicketRequest,
  viewer: ViewerContext
): { success: true; ticket: Ticket } | { success: false; error: string } {
  const ticket = ticketsStore.get(id);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  if (!canUpdateTicket(ticket, viewer)) {
    return { success: false, error: 'このチケットを更新する権限がありません' };
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (patch.title !== undefined && patch.title !== ticket.title) {
    before.title = ticket.title;
    after.title = patch.title;
    ticket.title = patch.title;
  }

  if (patch.description !== undefined && patch.description !== ticket.description) {
    before.description = ticket.description.slice(0, 50);
    after.description = patch.description.slice(0, 50);
    ticket.description = patch.description;
  }

  if (patch.priority !== undefined && patch.priority !== ticket.priority) {
    before.priority = ticket.priority;
    after.priority = patch.priority;
    ticket.priority = patch.priority;
    recordEvent(id, 'priority_change', viewer.userId, before, after, null);
  }

  if (patch.category !== undefined && patch.category !== ticket.category) {
    before.category = ticket.category;
    after.category = patch.category;
    ticket.category = patch.category;
    recordEvent(id, 'category_change', viewer.userId, before, after, null);
  }

  if (patch.dueAt !== undefined) {
    ticket.dueAt = patch.dueAt;
  }

  if (patch.tags !== undefined) {
    ticket.tagsJson = patch.tags;
  }

  if (patch.location !== undefined) {
    ticket.location = patch.location;
  }

  // Task 033: businessUnitId 更新（backfill用）
  if (patch.businessUnitId !== undefined) {
    before.businessUnitId = ticket.businessUnitId;
    after.businessUnitId = patch.businessUnitId;
    ticket.businessUnitId = patch.businessUnitId;
  }

  // Ticket 071: stage 更新
  if (patch.stage !== undefined && patch.stage !== ticket.stage) {
    const stageBefore = { stage: ticket.stage };
    const stageAfter = { stage: patch.stage };
    ticket.stage = patch.stage;
    ticket.stageChangedAt = new Date().toISOString();
    recordEvent(id, 'stage_change', viewer.userId, stageBefore, stageAfter, null);
  }

  ticket.updatedAt = new Date().toISOString();

  if (Object.keys(after).length > 0) {
    recordEvent(id, 'update', viewer.userId, before, after, null);
  }

  return { success: true, ticket };
}

// ========== 担当割当 ==========

export function assignTicket(
  id: string,
  assigneeUserId: string,
  viewer: ViewerContext
): { success: true; ticket: Ticket } | { success: false; error: string } {
  const ticket = ticketsStore.get(id);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  if (!canAssignTicket(viewer)) {
    return { success: false, error: '担当を割り当てる権限がありません' };
  }

  const before = { assigneeUserId: ticket.assigneeUserId };
  ticket.assigneeUserId = assigneeUserId;
  ticket.assigneeUserName = getUserName(assigneeUserId);
  ticket.updatedAt = new Date().toISOString();

  const after = { assigneeUserId, assigneeUserName: ticket.assigneeUserName };

  recordEvent(id, 'assign', viewer.userId, before, after, null);

  // assigneeを自動watch
  addWatcher(id, assigneeUserId);

  // Task 057: 未割当キューから削除
  removeFromUnassignedQueue('ticket', id);

  return { success: true, ticket };
}

// ========== 担当解除 ==========

export function unassignTicket(
  id: string,
  viewer: ViewerContext
): { success: true; ticket: Ticket } | { success: false; error: string } {
  const ticket = ticketsStore.get(id);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  if (!canAssignTicket(viewer)) {
    return { success: false, error: '担当を解除する権限がありません' };
  }

  const before = { assigneeUserId: ticket.assigneeUserId };
  ticket.assigneeUserId = null;
  ticket.assigneeUserName = null;
  ticket.updatedAt = new Date().toISOString();

  recordEvent(id, 'unassign', viewer.userId, before, { assigneeUserId: null }, null);

  return { success: true, ticket };
}

// ========== ステータス変更 ==========

export function changeTicketStatus(
  id: string,
  newStatus: TicketStatus,
  viewer: ViewerContext
): { success: true; ticket: Ticket } | { success: false; error: string } {
  const ticket = ticketsStore.get(id);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  // 権限チェック
  const canChange =
    canUpdateTicket(ticket, viewer) ||
    (newStatus === 'closed' && canForceCloseTicket(viewer)) ||
    (newStatus === 'archived' && canForceCloseTicket(viewer));

  if (!canChange) {
    return { success: false, error: 'ステータスを変更する権限がありません' };
  }

  // reopen対応
  if (newStatus === 'open' && ['resolved', 'closed'].includes(ticket.status)) {
    const before = { status: ticket.status };
    ticket.status = 'open';
    ticket.resolvedAt = null;
    ticket.closedAt = null;
    ticket.updatedAt = new Date().toISOString();
    recordEvent(id, 'reopen', viewer.userId, before, { status: 'open' }, null);
    return { success: true, ticket };
  }

  const before = { status: ticket.status };
  ticket.status = newStatus;
  ticket.updatedAt = new Date().toISOString();

  // resolved/closedの日時更新
  if (newStatus === 'resolved') {
    ticket.resolvedAt = ticket.updatedAt;
    recordEvent(id, 'resolve', viewer.userId, before, { status: newStatus }, null);
  } else if (newStatus === 'closed') {
    ticket.closedAt = ticket.updatedAt;
    recordEvent(id, 'close', viewer.userId, before, { status: newStatus }, null);
  } else {
    recordEvent(id, 'status_change', viewer.userId, before, { status: newStatus }, null);
  }

  return { success: true, ticket };
}

// ========== Ticket 071: ステージ変更 ==========

export function changeTicketStage(
  id: string,
  newStage: VacancyInquiryStage,
  viewer: ViewerContext
): { success: true; ticket: Ticket } | { success: false; error: string } {
  const ticket = ticketsStore.get(id);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  if (!canUpdateTicket(ticket, viewer)) {
    return { success: false, error: 'ステージを変更する権限がありません' };
  }

  if (ticket.pipeline !== 'vacancy_inquiry') {
    return { success: false, error: 'このチケットはパイプライン管理対象ではありません' };
  }

  if (ticket.stage === newStage) {
    return { success: true, ticket };  // 同じステージなら何もしない
  }

  const before = { stage: ticket.stage };
  const now = new Date().toISOString();

  ticket.stage = newStage;
  ticket.stageChangedAt = now;
  ticket.updatedAt = now;

  recordEvent(id, 'stage_change', viewer.userId, before, { stage: newStage }, null);

  return { success: true, ticket };
}

// ========== Ticket 084: 申込記録 ==========

export interface MarkAsAppliedRequest {
  desiredMoveInDate?: string;
  requiredDocsStatus?: {
    id?: boolean;
    insurance?: boolean;
    guarantor?: boolean;
    incomeProof?: boolean;
    other?: string;
  };
  applicationNote?: string;
  applicationChannel?: 'in_person' | 'online' | 'other';
}

export function markAsApplied(
  ticketId: string,
  data: MarkAsAppliedRequest,
  viewer: ViewerContext
): { success: true; ticket: Ticket } | { success: false; error: string } {
  const ticket = ticketsStore.get(ticketId);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  if (!canUpdateTicket(ticket, viewer)) {
    return { success: false, error: '申込を記録する権限がありません' };
  }

  if (ticket.pipeline !== 'vacancy_inquiry') {
    return { success: false, error: 'このチケットは空室問い合わせではありません' };
  }

  if (ticket.relatedType !== 'vacancy_inquiry') {
    return { success: false, error: 'このチケットは空室問い合わせではありません' };
  }

  const now = new Date().toISOString();
  const beforeMeta = { ...(ticket.metaJson || {}) };
  const beforeStage = ticket.stage;

  // meta を更新
  const newMeta = {
    ...ticket.metaJson,
    appliedAt: now,
    desiredMoveInDate: data.desiredMoveInDate ?? undefined,
    requiredDocsStatus: data.requiredDocsStatus ?? undefined,
    applicationNote: data.applicationNote ?? undefined,
    applicationChannel: data.applicationChannel ?? undefined,
  };
  ticket.metaJson = newMeta;

  // stage を applied に変更
  ticket.stage = 'applied';
  ticket.stageChangedAt = now;
  ticket.updatedAt = now;

  // イベント記録
  recordEvent(
    ticketId,
    'mark_applied',
    viewer.userId,
    { stage: beforeStage, meta: beforeMeta },
    { stage: 'applied', meta: newMeta },
    null
  );

  return { success: true, ticket };
}

// ========== Ticket 085: 受入決定 ==========

export interface MarkAsAcceptedRequest {
  vacancyUnitId?: string;   // 空室ユニットID（無ければ既存metaから取得）
  acceptedNote?: string;    // 受入決定メモ
}

export interface MarkAsAcceptedResult {
  success: boolean;
  error?: string;
  ticket?: Ticket;
  businessUnitId?: string;
  reservedVacancyUnitId?: string;
}

export function markAsAccepted(
  ticketId: string,
  data: MarkAsAcceptedRequest,
  viewer: ViewerContext
): MarkAsAcceptedResult {
  const ticket = ticketsStore.get(ticketId);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  if (!canUpdateTicket(ticket, viewer)) {
    return { success: false, error: '受入決定を記録する権限がありません' };
  }

  if (ticket.pipeline !== 'vacancy_inquiry') {
    return { success: false, error: 'このチケットは空室問い合わせではありません' };
  }

  if (ticket.relatedType !== 'vacancy_inquiry') {
    return { success: false, error: 'このチケットは空室問い合わせではありません' };
  }

  // 既に accepted 以降のステージなら不可
  if (ticket.stage === 'accepted' || ticket.stage === 'rejected' || ticket.stage === 'closed') {
    return { success: false, error: 'このチケットは既に成約/不成約/クローズ済みです' };
  }

  // businessUnitId が必須
  if (!ticket.businessUnitId) {
    return { success: false, error: '事業単位が設定されていません' };
  }

  // vacancyUnitId の決定
  const resolvedVacancyUnitId = data.vacancyUnitId || (ticket.metaJson?.vacancyUnitId as string | undefined);
  if (!resolvedVacancyUnitId) {
    return { success: false, error: '空室ユニットを指定してください' };
  }

  const now = new Date().toISOString();
  const beforeMeta = { ...(ticket.metaJson || {}) };
  const beforeStage = ticket.stage;

  // meta を更新
  const newMeta = {
    ...ticket.metaJson,
    acceptedAt: now,
    acceptedNote: data.acceptedNote ?? undefined,
    reservedVacancyUnitId: resolvedVacancyUnitId,
    acceptedByUserId: viewer.userId,
  };
  ticket.metaJson = newMeta;

  // stage を accepted に変更
  ticket.stage = 'accepted';
  ticket.stageChangedAt = now;
  ticket.updatedAt = now;

  // イベント記録
  recordEvent(
    ticketId,
    'mark_accepted',
    viewer.userId,
    { stage: beforeStage, meta: beforeMeta },
    { stage: 'accepted', meta: newMeta },
    null
  );

  // 呼び出し元でsuggestion作成できるように情報を返す
  return {
    success: true,
    ticket,
    businessUnitId: ticket.businessUnitId,
    reservedVacancyUnitId: resolvedVacancyUnitId,
  };
}

// ========== Ticket 071: 空室問い合わせ統計 ==========

export function getVacancyInquiryStats(
  viewer: ViewerContext,
  options?: { businessUnitId?: string | null }
): VacancyInquiryStats {
  let tickets = Array.from(ticketsStore.values())
    .filter((t) => t.pipeline === 'vacancy_inquiry');

  // RBAC適用
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    tickets = tickets.filter((t) => canViewTicket(t, viewer));
  }

  // 事業単位フィルタ
  if (options?.businessUnitId !== undefined) {
    if (options.businessUnitId === null) {
      tickets = tickets.filter((t) => t.businessUnitId === null);
    } else {
      tickets = tickets.filter((t) => t.businessUnitId === options.businessUnitId);
    }
  }

  const weekStart = getWeekStart();

  const byStage: Record<VacancyInquiryStage, number> = {
    new: 0,
    contacted: 0,
    tour_scheduled: 0,
    applied: 0,
    accepted: 0,
    rejected: 0,
    closed: 0,
  };

  const thisWeek = {
    newCount: 0,
    contactedCount: 0,
    tourScheduledCount: 0,
    appliedCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
  };

  let slaBreachedCount = 0;
  let slaTargetCount = 0;     // SLA対象（newステージで作成された）件数
  let slaCompliantCount = 0;  // SLA遵守（newから抜けた）件数

  for (const ticket of tickets) {
    // ステージ別集計
    if (ticket.stage) {
      byStage[ticket.stage]++;
    }

    // SLA超過チェック
    if (isSlaBreached(ticket)) {
      slaBreachedCount++;
    }

    // 今週作成分
    const createdThisWeek = new Date(ticket.createdAt) >= weekStart;
    if (createdThisWeek) {
      slaTargetCount++;  // 今週作成 = SLA対象

      // ステージが new 以外ならSLA遵守
      if (ticket.stage !== 'new') {
        slaCompliantCount++;
      }
    }

    // ステージ変更が今週のものをカウント
    if (ticket.stageChangedAt && new Date(ticket.stageChangedAt) >= weekStart) {
      switch (ticket.stage) {
        case 'new':
          thisWeek.newCount++;
          break;
        case 'contacted':
          thisWeek.contactedCount++;
          break;
        case 'tour_scheduled':
          thisWeek.tourScheduledCount++;
          break;
        case 'applied':
          thisWeek.appliedCount++;
          break;
        case 'accepted':
          thisWeek.acceptedCount++;
          break;
        case 'rejected':
          thisWeek.rejectedCount++;
          break;
      }
    }
  }

  // SLA遵守率計算
  const slaComplianceRate = slaTargetCount > 0
    ? Math.round((slaCompliantCount / slaTargetCount) * 100)
    : 100;

  return {
    total: tickets.length,
    byStage,
    slaBreached: slaBreachedCount,
    thisWeek,
    slaComplianceRate,
  };
}

// ========== Ticket 071: SLA超過チケット取得（バッチ用） ==========

export function getSlaBreachedTickets(): Ticket[] {
  return Array.from(ticketsStore.values())
    .filter((t) => t.pipeline === 'vacancy_inquiry')
    .filter(isSlaBreached);
}

// ========== Ticket 123: 営業タスク完了 ==========

import type { SalesTaskResultCode } from './types';
import { mapTaskResultToSalesResult } from './types';

export interface CompleteSalesTaskRequest {
  resultCode: SalesTaskResultCode;
  resultNote?: string;
  nextFollowUpAt?: string;
}

export interface CompleteSalesTaskResult {
  success: boolean;
  error?: string;
  ticket?: Ticket;
}

/**
 * 営業タスク（sales_next_action）を完了させる
 *
 * - resultCode が必須
 * - チケットステータスを closed に変更
 * - meta に結果情報を保存
 * - events に sales_task_completed を記録
 * - originTicketId がある場合、元チケットへの連動処理（任意）
 */
export function completeSalesTask(
  ticketId: string,
  data: CompleteSalesTaskRequest,
  viewer: ViewerContext
): CompleteSalesTaskResult {
  const ticket = ticketsStore.get(ticketId);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  // sales_next_action チケットのみ対象
  if (ticket.relatedType !== 'sales_next_action') {
    return { success: false, error: 'このチケットは営業タスクではありません' };
  }

  // 既にクローズ済みなら不可
  if (ticket.status === 'closed' || ticket.status === 'archived') {
    return { success: false, error: 'このチケットは既にクローズ済みです' };
  }

  // RBAC: assignee または manager以上
  const isAssignee = ticket.assigneeUserId === viewer.userId;
  const isManager = ['manager', 'executive', 'admin'].includes(viewer.role);

  if (!isAssignee && !isManager) {
    return { success: false, error: '営業タスクを完了する権限がありません' };
  }

  const now = new Date().toISOString();
  const beforeStatus = ticket.status;
  const beforeMeta = { ...(ticket.metaJson || {}) };

  // meta を更新（正規化結果コードも保存）
  const normalizedResultCode = mapTaskResultToSalesResult(data.resultCode);
  const newMeta = {
    ...ticket.metaJson,
    resultCode: data.resultCode,
    normalizedResultCode,
    resultNote: data.resultNote ?? undefined,
    completedAt: now,
    nextFollowUpAt: data.nextFollowUpAt ?? undefined,
  };
  ticket.metaJson = newMeta;

  // ステータスを closed に変更
  ticket.status = 'closed';
  ticket.closedAt = now;
  ticket.updatedAt = now;

  // イベント記録
  recordEvent(
    ticketId,
    'sales_task_completed',
    viewer.userId,
    { status: beforeStatus, meta: beforeMeta },
    { status: 'closed', meta: newMeta, resultCode: data.resultCode },
    data.resultNote || null
  );

  // 元チケットがある場合、結果に応じたステージ更新（任意）
  const originTicketId = ticket.metaJson?.originTicketId as string | undefined;
  if (originTicketId) {
    const originTicket = ticketsStore.get(originTicketId);
    if (originTicket && originTicket.pipeline === 'vacancy_inquiry') {
      // 結果コードに応じたステージ更新提案
      // tour_scheduled → tour_scheduled
      // applied → applied
      // accepted → accepted
      const stageMapping: Partial<Record<SalesTaskResultCode, VacancyInquiryStage>> = {
        tour_scheduled: 'tour_scheduled',
        applied: 'applied',
        accepted: 'accepted',
        rejected: 'rejected',
      };

      const suggestedStage = stageMapping[data.resultCode];
      if (suggestedStage && originTicket.stage !== suggestedStage) {
        // コメントを追加して記録（自動更新はしない）
        const comment: TicketComment = {
          id: generateCommentId(),
          ticketId: originTicketId,
          userId: viewer.userId,
          userName: getUserName(viewer.userId),
          message: `営業タスク完了: ${data.resultCode}${data.resultNote ? ` - ${data.resultNote}` : ''}`,
          createdAt: now,
        };
        commentsStore.set(comment.id, comment);
        originTicket.updatedAt = now;
      }
    }
  }

  return { success: true, ticket };
}

// ========== コメント追加 ==========

export function addTicketComment(
  ticketId: string,
  message: string,
  actorUserId: string,
  viewer: ViewerContext
): { success: true; comment: TicketComment } | { success: false; error: string } {
  const ticket = ticketsStore.get(ticketId);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  if (!canViewTicket(ticket, viewer)) {
    return { success: false, error: 'このチケットにコメントする権限がありません' };
  }

  const comment: TicketComment = {
    id: generateCommentId(),
    ticketId,
    userId: actorUserId,
    userName: getUserName(actorUserId),
    message,
    createdAt: new Date().toISOString(),
  };

  commentsStore.set(comment.id, comment);

  // チケットのupdatedAt更新
  ticket.updatedAt = comment.createdAt;

  // イベント記録
  recordEvent(ticketId, 'comment', actorUserId, null, { commentId: comment.id }, null);

  return { success: true, comment };
}

// ========== コメント一覧 ==========

export function listTicketComments(ticketId: string): TicketComment[] {
  return Array.from(commentsStore.values())
    .filter((c) => c.ticketId === ticketId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

// ========== イベント一覧 ==========

export function listTicketEvents(ticketId: string): TicketEvent[] {
  return Array.from(eventsStore.values())
    .filter((e) => e.ticketId === ticketId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ========== ウォッチャー管理 ==========

export function addWatcher(ticketId: string, userId: string): void {
  // 既存チェック
  const existing = Array.from(watchersStore.values()).find(
    (w) => w.ticketId === ticketId && w.userId === userId
  );
  if (existing) return;

  const watcher: TicketWatcher = {
    id: generateWatcherId(),
    ticketId,
    userId,
    createdAt: new Date().toISOString(),
  };
  watchersStore.set(watcher.id, watcher);
}

export function removeWatcher(ticketId: string, userId: string): void {
  const watcher = Array.from(watchersStore.values()).find(
    (w) => w.ticketId === ticketId && w.userId === userId
  );
  if (watcher) {
    watchersStore.delete(watcher.id);
  }
}

export function getWatchers(ticketId: string): string[] {
  return Array.from(watchersStore.values())
    .filter((w) => w.ticketId === ticketId)
    .map((w) => w.userId);
}

// ========== 統計 ==========

/**
 * チケット統計オプション（Task 030）
 */
export interface TicketStatsOptions {
  businessUnitId?: string | null;
}

export function getTicketStats(
  viewer: ViewerContext,
  options?: TicketStatsOptions
): TicketStats {
  let tickets = Array.from(ticketsStore.values());

  // RBAC適用
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    tickets = tickets.filter((t) => canViewTicket(t, viewer));
  }

  // Task 030: 事業単位フィルタ
  if (options?.businessUnitId !== undefined) {
    if (options.businessUnitId === null) {
      tickets = tickets.filter((t) => t.businessUnitId === null);
    } else {
      tickets = tickets.filter((t) => t.businessUnitId === options.businessUnitId);
    }
  }

  const weekStart = getWeekStart();

  const stats: TicketStats = {
    open: 0,
    urgentOpen: 0,
    overdue: 0,
    myAssignedOpen: 0,
    myRequestedOpen: 0,
    inProgress: 0,
    waiting: 0,
    resolvedThisWeek: 0,
    createdThisWeek: 0,
  };

  for (const ticket of tickets) {
    // open系
    if (['open', 'in_progress', 'waiting'].includes(ticket.status)) {
      stats.open++;
      if (ticket.priority === 'urgent') stats.urgentOpen++;
      if (isOverdue(ticket)) stats.overdue++;
      if (ticket.assigneeUserId === viewer.userId) stats.myAssignedOpen++;
      if (ticket.requesterUserId === viewer.userId) stats.myRequestedOpen++;
      if (ticket.status === 'in_progress') stats.inProgress++;
      if (ticket.status === 'waiting') stats.waiting++;
    }

    // 今週解決
    if (ticket.resolvedAt && new Date(ticket.resolvedAt) >= weekStart) {
      stats.resolvedThisWeek++;
    }

    // 今週作成
    if (new Date(ticket.createdAt) >= weekStart) {
      stats.createdThisWeek++;
    }
  }

  return stats;
}

// ========== 期限超過チケット取得（バッチ用） ==========

export function getOverdueTickets(): Ticket[] {
  return Array.from(ticketsStore.values()).filter(isOverdue);
}

// ========== Ticket 079: 重複問い合わせ検出・統合 ==========

import {
  DUPLICATE_CHECK_DAYS,
  DUPLICATE_CHECK_STATUSES,
} from '@/lib/vacancies/contactKey';

/**
 * 重複する空室問い合わせチケットを検索
 *
 * @param contactHash - 連絡先ハッシュ
 * @param businessUnitId - 事業単位ID
 * @returns 既存のチケット（見つからなければnull）
 */
export function findDuplicateVacancyInquiryTicket(
  contactHash: string,
  businessUnitId: string
): Ticket | null {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DUPLICATE_CHECK_DAYS);

  const candidates = Array.from(ticketsStore.values())
    .filter((t) => t.relatedType === 'vacancy_inquiry')
    .filter((t) => t.businessUnitId === businessUnitId)
    .filter((t) => DUPLICATE_CHECK_STATUSES.includes(t.status as typeof DUPLICATE_CHECK_STATUSES[number]))
    .filter((t) => new Date(t.createdAt) >= cutoffDate)
    .filter((t) => t.metaJson?.contactHash === contactHash);

  if (candidates.length === 0) {
    return null;
  }

  // 最新のチケットを返す
  candidates.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return candidates[0];
}

/**
 * 既存チケットに重複問い合わせを統合
 *
 * @param ticketId - 既存チケットID
 * @param pendingData - 新しい問い合わせデータ
 * @returns 更新されたチケット
 */
export function mergeInquiryToTicket(
  ticketId: string,
  pendingData: {
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    desiredMoveIn?: string | null;
    message?: string | null;
    buildingName?: string | null;
    vacancyUnitId?: string | null;
  }
): { success: true; ticket: Ticket } | { success: false; error: string } {
  const ticket = ticketsStore.get(ticketId);

  if (!ticket) {
    return { success: false, error: 'チケットが見つかりません' };
  }

  const now = new Date().toISOString();

  // 追記内容を作成
  const appendParts: string[] = [
    '',
    '---',
    `【追加問い合わせ】${now}`,
  ];

  if (pendingData.contactName) {
    appendParts.push(`お名前: ${pendingData.contactName}`);
  }
  if (pendingData.buildingName) {
    appendParts.push(`希望物件: ${pendingData.buildingName}`);
  }
  if (pendingData.desiredMoveIn) {
    appendParts.push(`入居希望時期: ${pendingData.desiredMoveIn}`);
  }
  if (pendingData.message) {
    appendParts.push(`メッセージ: ${pendingData.message}`);
  }

  // description に追記
  ticket.description = ticket.description + appendParts.join('\n');
  ticket.updatedAt = now;

  // mergedCount をインクリメント
  if (!ticket.metaJson) {
    ticket.metaJson = {};
  }
  ticket.metaJson.mergedCount = (ticket.metaJson.mergedCount || 0) + 1;

  // イベント記録
  recordEvent(
    ticketId,
    'merge_inquiry',
    null, // system action
    null,
    {
      pendingName: pendingData.contactName,
      vacancyUnitId: pendingData.vacancyUnitId,
      mergedCount: ticket.metaJson.mergedCount,
    },
    '同一連絡先からの追加問い合わせを統合'
  );

  return { success: true, ticket };
}

// ========== デモデータ投入 ==========

export function seedTicketData(): void {
  if (ticketsStore.size > 0) return;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const tickets: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      title: '【緊急】夜勤帯の緊急連絡体制について',
      description: '夜勤帯における緊急連絡体制の見直しが必要です。現行のフローでは対応が遅れる可能性があります。',
      status: 'open',
      priority: 'urgent',
      category: 'ops',
      businessUnitId: 'bu_001',        // Task 030: 西淀川
      requesterUserId: 'user_001',
      requesterUserName: '山田太郎',
      assigneeUserId: 'user_003',
      assigneeUserName: '鈴木花子',
      assigneeRole: null,
      dueAt: yesterday.toISOString(),
      resolvedAt: null,
      closedAt: null,
      tagsJson: ['夜勤', '緊急対応'],
      metaJson: null,
      relatedType: null,
      relatedId: null,
      location: '本館',
      pipeline: null,
      stage: null,
      slaDueAt: null,
      stageChangedAt: null,
    },
    {
      title: '空調設備の点検依頼',
      description: '3階東棟の空調が効きにくいとの報告があります。点検をお願いします。',
      status: 'in_progress',
      priority: 'high',
      category: 'facility',
      businessUnitId: 'bu_003',        // Task 030: サ高住
      requesterUserId: 'user_002',
      requesterUserName: '佐藤次郎',
      assigneeUserId: 'user_004',
      assigneeUserName: '高橋三郎',
      assigneeRole: null,
      dueAt: tomorrow.toISOString(),
      resolvedAt: null,
      closedAt: null,
      tagsJson: ['設備', '空調'],
      metaJson: null,
      relatedType: null,
      relatedId: null,
      location: '3階東棟',
      pipeline: null,
      stage: null,
      slaDueAt: null,
      stageChangedAt: null,
    },
    {
      title: '新人研修資料の更新依頼',
      description: '4月入社の新人研修に向けて、研修資料の更新をお願いします。',
      status: 'open',
      priority: 'normal',
      category: 'hr',
      businessUnitId: 'bu_corp',       // Task 030: 法人本部
      requesterUserId: 'user_003',
      requesterUserName: '鈴木花子',
      assigneeUserId: null,
      assigneeUserName: null,
      assigneeRole: null,
      dueAt: nextWeek.toISOString(),
      resolvedAt: null,
      closedAt: null,
      tagsJson: ['研修', '資料'],
      metaJson: null,
      relatedType: null,
      relatedId: null,
      location: null,
      pipeline: null,
      stage: null,
      slaDueAt: null,
      stageChangedAt: null,
    },
    {
      title: 'PCのログイン不具合',
      description: '業務用PCでログインできない事象が発生しています。パスワードリセットをお願いします。',
      status: 'waiting',
      priority: 'high',
      category: 'it',
      businessUnitId: 'bu_002',        // Task 030: 東淀川
      requesterUserId: 'user_005',
      requesterUserName: '田中美咲',
      assigneeUserId: 'user_003',
      assigneeUserName: '鈴木花子',
      assigneeRole: null,
      dueAt: now.toISOString(),
      resolvedAt: null,
      closedAt: null,
      tagsJson: ['IT', 'PC'],
      metaJson: null,
      relatedType: null,
      relatedId: null,
      location: '事務室',
      pipeline: null,
      stage: null,
      slaDueAt: null,
      stageChangedAt: null,
    },
    {
      title: '利用者様からの問い合わせ対応',
      description: '利用者様のご家族から請求書について問い合わせがありました。確認をお願いします。',
      status: 'resolved',
      priority: 'normal',
      category: 'client',
      businessUnitId: 'bu_001',        // Task 030: 西淀川
      requesterUserId: 'user_001',
      requesterUserName: '山田太郎',
      assigneeUserId: 'user_002',
      assigneeUserName: '佐藤次郎',
      assigneeRole: null,
      dueAt: twoDaysAgo.toISOString(),
      resolvedAt: yesterday.toISOString(),
      closedAt: null,
      tagsJson: ['利用者対応', '請求'],
      metaJson: null,
      relatedType: null,
      relatedId: null,
      location: null,
      pipeline: null,
      stage: null,
      slaDueAt: null,
      stageChangedAt: null,
    },
    {
      title: '備品発注依頼（消耗品）',
      description: 'トイレットペーパー、ティッシュ等の消耗品が不足しています。発注をお願いします。',
      status: 'closed',
      priority: 'low',
      category: 'general',
      businessUnitId: null,            // Task 030: 未分類
      requesterUserId: 'user_004',
      requesterUserName: '高橋三郎',
      assigneeUserId: 'user_003',
      assigneeUserName: '鈴木花子',
      assigneeRole: null,
      dueAt: threeDaysAgo.toISOString(),
      resolvedAt: threeDaysAgo.toISOString(),
      closedAt: twoDaysAgo.toISOString(),
      tagsJson: ['備品', '発注'],
      metaJson: null,
      relatedType: null,
      relatedId: null,
      location: null,
      pipeline: null,
      stage: null,
      slaDueAt: null,
      stageChangedAt: null,
    },
  ];

  for (const t of tickets) {
    const ticket: Ticket = {
      ...t,
      id: generateTicketId(),
      createdAt: threeDaysAgo.toISOString(),
      updatedAt: now.toISOString(),
    };
    ticketsStore.set(ticket.id, ticket);

    // イベント記録
    recordEvent(ticket.id, 'create', ticket.requesterUserId, null, {
      title: ticket.title,
      priority: ticket.priority,
    }, null);

    if (ticket.assigneeUserId) {
      recordEvent(ticket.id, 'assign', 'user_003', null, {
        assigneeUserId: ticket.assigneeUserId,
      }, null);
    }
  }

  // コメントを追加
  const comment1: TicketComment = {
    id: generateCommentId(),
    ticketId: 'ticket_0001',
    userId: 'user_003',
    userName: '鈴木花子',
    message: '確認しました。本日中に対応マニュアルを更新します。',
    createdAt: yesterday.toISOString(),
  };
  commentsStore.set(comment1.id, comment1);

  const comment2: TicketComment = {
    id: generateCommentId(),
    ticketId: 'ticket_0002',
    userId: 'user_004',
    userName: '高橋三郎',
    message: '業者に連絡済みです。明日午前中に点検に来る予定です。',
    createdAt: now.toISOString(),
  };
  commentsStore.set(comment2.id, comment2);
}

// 初期化時にデモデータ投入
seedTicketData();
