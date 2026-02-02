/**
 * クレーム対応リポジトリ
 *
 * クレームのCRUD操作と統計
 * インメモリストレージ（本番ではDBに置き換え）
 */

import type {
  Complaint,
  ComplaintComment,
  ComplaintAction,
  ComplaintEvent,
  ComplaintStats,
  ComplaintStatus,
  ComplaintActionStatus,
  CreateComplaintInput,
  UpdateComplaintInput,
  CreateComplaintActionInput,
  UpdateComplaintActionInput,
  ListComplaintsFilter,
  ViewerContext,
} from './types';
import { canViewComplaint, canManageComplaints, isOpenStatus } from './types';

// ========== インメモリストレージ ==========

const complaintsStore = new Map<string, Complaint>();
const commentsStore = new Map<string, ComplaintComment[]>();
const actionsStore = new Map<string, ComplaintAction>();
const eventsStore: ComplaintEvent[] = [];

// ID生成
let idCounter = 1;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

// 監査ログ記録
function recordEvent(
  complaintId: string,
  action: ComplaintEvent['action'],
  actorUserId: string | null,
  beforeJson: Record<string, unknown> | null,
  afterJson: Record<string, unknown> | null,
  note: string | null
): void {
  const event: ComplaintEvent = {
    id: generateId('cmpev'),
    complaintId,
    actorUserId,
    action,
    beforeJson,
    afterJson,
    createdAt: new Date().toISOString(),
    note,
  };
  eventsStore.push(event);
}

// ========== クレーム管理 ==========

export function listComplaints(
  viewer: ViewerContext,
  filter: ListComplaintsFilter = {}
): { complaints: Complaint[]; total: number } {
  let complaints = Array.from(complaintsStore.values());
  const now = new Date();

  // RBAC: manager未満は自分が担当のもののみ
  if (!canManageComplaints(viewer) && viewer.role !== 'auditor') {
    complaints = complaints.filter((c) => c.assigneeUserId === viewer.userId);
  }

  // フィルタリング
  if (filter.status) {
    complaints = complaints.filter((c) => c.status === filter.status);
  }

  if (filter.severity) {
    complaints = complaints.filter((c) => c.severity === filter.severity);
  }

  if (filter.category) {
    complaints = complaints.filter((c) => c.category === filter.category);
  }

  if (filter.overdue === true) {
    complaints = complaints.filter(
      (c) =>
        c.dueAt &&
        new Date(c.dueAt) < now &&
        isOpenStatus(c.status)
    );
  }

  if (filter.myAssigned === true) {
    complaints = complaints.filter((c) => c.assigneeUserId === viewer.userId);
  }

  if (filter.q) {
    const q = filter.q.toLowerCase();
    complaints = complaints.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }

  // ソート（severity優先、新しい順）
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  complaints.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
  });

  const total = complaints.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  complaints = complaints.slice(offset, offset + limit);

  return { complaints, total };
}

export function getComplaintById(
  id: string,
  viewer: ViewerContext
): Complaint | null {
  const complaint = complaintsStore.get(id);
  if (!complaint) return null;

  // RBAC
  if (!canViewComplaint(viewer, complaint)) {
    return null;
  }

  return complaint;
}

export function createComplaint(
  input: CreateComplaintInput,
  actorUserId: string
): { success: true; complaint: Complaint } | { success: false; error: string } {
  const now = new Date().toISOString();
  const complaint: Complaint = {
    id: generateId('cmp'),
    title: input.title,
    description: input.description,
    category: input.category,
    severity: input.severity,
    status: 'new',
    requesterType: input.requesterType,
    requesterName: input.requesterName ?? null,
    contactHint: input.contactHint ?? null,
    occurredAt: input.occurredAt ?? null,
    receivedAt: now,
    dueAt: input.dueAt ?? null,
    assigneeUserId: null,
    ownerRole: null,
    resolutionSummary: null,
    rootCause: null,
    preventivePlan: null,
    relatedTicketId: null,
    relatedCommitteeActionId: null,
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    closedAt: null,
  };

  complaintsStore.set(complaint.id, complaint);
  commentsStore.set(complaint.id, []);
  recordEvent(complaint.id, 'create', actorUserId, null, { ...complaint }, null);

  return { success: true, complaint };
}

export function updateComplaint(
  id: string,
  patch: UpdateComplaintInput,
  actorUserId: string
): { success: true; complaint: Complaint } | { success: false; error: string } {
  const complaint = complaintsStore.get(id);
  if (!complaint) {
    return { success: false, error: 'クレームが見つかりません' };
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  const complaintRecord = complaint as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && complaintRecord[key] !== value) {
      before[key] = complaintRecord[key];
      after[key] = value;
      complaintRecord[key] = value;
    }
  }

  complaint.updatedAt = new Date().toISOString();

  if (Object.keys(after).length > 0) {
    recordEvent(id, 'update_fields', actorUserId, before, after, null);
  }

  return { success: true, complaint };
}

export function assignComplaint(
  id: string,
  assigneeUserId: string | null,
  actorUserId: string
): { success: true; complaint: Complaint } | { success: false; error: string } {
  const complaint = complaintsStore.get(id);
  if (!complaint) {
    return { success: false, error: 'クレームが見つかりません' };
  }

  const before = { assigneeUserId: complaint.assigneeUserId };
  complaint.assigneeUserId = assigneeUserId;
  complaint.updatedAt = new Date().toISOString();

  recordEvent(id, 'assign', actorUserId, before, { assigneeUserId }, null);

  return { success: true, complaint };
}

export function setDueAt(
  id: string,
  dueAt: string | null,
  actorUserId: string
): { success: true; complaint: Complaint } | { success: false; error: string } {
  const complaint = complaintsStore.get(id);
  if (!complaint) {
    return { success: false, error: 'クレームが見つかりません' };
  }

  const before = { dueAt: complaint.dueAt };
  complaint.dueAt = dueAt;
  complaint.updatedAt = new Date().toISOString();

  recordEvent(id, 'set_due', actorUserId, before, { dueAt }, null);

  return { success: true, complaint };
}

export function changeStatus(
  id: string,
  status: ComplaintStatus,
  actorUserId: string
): { success: true; complaint: Complaint } | { success: false; error: string } {
  const complaint = complaintsStore.get(id);
  if (!complaint) {
    return { success: false, error: 'クレームが見つかりません' };
  }

  const before = {
    status: complaint.status,
    resolvedAt: complaint.resolvedAt,
    closedAt: complaint.closedAt,
  };
  const oldStatus = complaint.status;
  complaint.status = status;
  complaint.updatedAt = new Date().toISOString();

  // resolved/closed の日時を更新
  if (status === 'resolved' && oldStatus !== 'resolved') {
    complaint.resolvedAt = new Date().toISOString();
  }
  if (status === 'closed' && oldStatus !== 'closed') {
    complaint.closedAt = new Date().toISOString();
  }

  const action =
    status === 'resolved'
      ? 'mark_resolved'
      : status === 'closed'
      ? 'close'
      : isOpenStatus(status) && !isOpenStatus(oldStatus)
      ? 'reopen'
      : 'status_change';

  recordEvent(
    id,
    action,
    actorUserId,
    before,
    { status, resolvedAt: complaint.resolvedAt, closedAt: complaint.closedAt },
    null
  );

  return { success: true, complaint };
}

// ========== コメント管理 ==========

export function listComments(complaintId: string): ComplaintComment[] {
  return commentsStore.get(complaintId) ?? [];
}

export function addComment(
  complaintId: string,
  message: string,
  actorUserId: string
): { success: true; comment: ComplaintComment } | { success: false; error: string } {
  const complaint = complaintsStore.get(complaintId);
  if (!complaint) {
    return { success: false, error: 'クレームが見つかりません' };
  }

  const comment: ComplaintComment = {
    id: generateId('cmpcmt'),
    complaintId,
    userId: actorUserId,
    message,
    createdAt: new Date().toISOString(),
  };

  const comments = commentsStore.get(complaintId) ?? [];
  comments.push(comment);
  commentsStore.set(complaintId, comments);

  complaint.updatedAt = new Date().toISOString();

  recordEvent(complaintId, 'add_comment', actorUserId, null, { commentId: comment.id }, null);

  return { success: true, comment };
}

// ========== 是正アクション管理 ==========

export function listActions(complaintId: string): ComplaintAction[] {
  return Array.from(actionsStore.values()).filter(
    (a) => a.complaintId === complaintId
  );
}

export function createAction(
  complaintId: string,
  input: CreateComplaintActionInput,
  actorUserId: string
): { success: true; action: ComplaintAction } | { success: false; error: string } {
  const complaint = complaintsStore.get(complaintId);
  if (!complaint) {
    return { success: false, error: 'クレームが見つかりません' };
  }

  const now = new Date().toISOString();
  const action: ComplaintAction = {
    id: generateId('cmpact'),
    complaintId,
    title: input.title,
    ownerUserId: input.ownerUserId ?? null,
    dueAt: input.dueAt ?? null,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };

  actionsStore.set(action.id, action);

  return { success: true, action };
}

export function updateAction(
  actionId: string,
  patch: UpdateComplaintActionInput,
  actorUserId: string
): { success: true; action: ComplaintAction } | { success: false; error: string } {
  const action = actionsStore.get(actionId);
  if (!action) {
    return { success: false, error: 'アクションが見つかりません' };
  }

  const actionRecord = action as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      actionRecord[key] = value;
    }
  }

  action.updatedAt = new Date().toISOString();

  return { success: true, action };
}

export function changeActionStatus(
  actionId: string,
  status: ComplaintActionStatus,
  actorUserId: string
): { success: true; action: ComplaintAction } | { success: false; error: string } {
  const action = actionsStore.get(actionId);
  if (!action) {
    return { success: false, error: 'アクションが見つかりません' };
  }

  action.status = status;
  action.updatedAt = new Date().toISOString();

  return { success: true, action };
}

// ========== 統計 ==========

export function getStats(viewer: ViewerContext): ComplaintStats {
  const complaints = Array.from(complaintsStore.values());
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // RBAC: manager未満は自分の担当のみ
  const visibleComplaints = canManageComplaints(viewer) || viewer.role === 'auditor'
    ? complaints
    : complaints.filter((c) => c.assigneeUserId === viewer.userId);

  const open = visibleComplaints.filter((c) => isOpenStatus(c.status)).length;
  const criticalOpen = visibleComplaints.filter(
    (c) => c.severity === 'critical' && isOpenStatus(c.status)
  ).length;
  const overdue = visibleComplaints.filter(
    (c) => c.dueAt && new Date(c.dueAt) < now && isOpenStatus(c.status)
  ).length;
  const myAssignedOpen = visibleComplaints.filter(
    (c) => c.assigneeUserId === viewer.userId && isOpenStatus(c.status)
  ).length;

  // 今月解決
  const resolvedThisMonth = visibleComplaints.filter(
    (c) => c.resolvedAt && new Date(c.resolvedAt) >= thisMonth
  ).length;

  // 平均解決日数（今月解決分）
  const resolvedWithTime = visibleComplaints.filter(
    (c) => c.resolvedAt && new Date(c.resolvedAt) >= thisMonth
  );
  let avgDaysToResolve: number | null = null;
  if (resolvedWithTime.length > 0) {
    const totalDays = resolvedWithTime.reduce((sum, c) => {
      const received = new Date(c.receivedAt).getTime();
      const resolved = new Date(c.resolvedAt!).getTime();
      return sum + (resolved - received) / (1000 * 60 * 60 * 24);
    }, 0);
    avgDaysToResolve = Math.round((totalDays / resolvedWithTime.length) * 10) / 10;
  }

  return {
    open,
    criticalOpen,
    overdue,
    myAssignedOpen,
    resolvedThisMonth,
    avgDaysToResolve,
  };
}

// ========== リスク検知 ==========

export function scanCriticalOpen(): Complaint[] {
  return Array.from(complaintsStore.values()).filter(
    (c) => c.severity === 'critical' && isOpenStatus(c.status)
  );
}

export function scanOverdue(): Complaint[] {
  const now = new Date();
  return Array.from(complaintsStore.values()).filter(
    (c) => c.dueAt && new Date(c.dueAt) < now && isOpenStatus(c.status)
  );
}

// ========== イベント取得 ==========

export function getEvents(complaintId: string): ComplaintEvent[] {
  return eventsStore
    .filter((e) => e.complaintId === complaintId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ========== デモデータ初期化 ==========

function initDemoData(): void {
  const now = new Date();

  const complaints: Complaint[] = [
    {
      id: 'cmp_001',
      title: '食事の提供時間が遅れた',
      description: '昼食の配膳が30分以上遅れ、冷めた状態で提供された。スタッフに確認したが謝罪のみで具体的な説明がなかった。',
      category: 'service',
      severity: 'medium',
      status: 'responding',
      requesterType: 'family',
      requesterName: '山田様（ご家族）',
      contactHint: null,
      occurredAt: '2026-01-28T12:00:00.000Z',
      receivedAt: '2026-01-28T14:00:00.000Z',
      dueAt: '2026-02-04T00:00:00.000Z',
      assigneeUserId: 'user_manager',
      ownerRole: null,
      resolutionSummary: null,
      rootCause: '厨房の人員不足により配膳が遅延',
      preventivePlan: null,
      relatedTicketId: null,
      relatedCommitteeActionId: null,
      createdByUserId: 'user_manager',
      createdAt: '2026-01-28T14:00:00.000Z',
      updatedAt: '2026-01-30T10:00:00.000Z',
      resolvedAt: null,
      closedAt: null,
    },
    {
      id: 'cmp_002',
      title: '転倒事故の報告が遅れた',
      description: '入居者が転倒したが、家族への連絡が翌日になった。重大な怪我はなかったが、連絡体制に不信感を抱いている。',
      category: 'safety',
      severity: 'high',
      status: 'investigating',
      requesterType: 'family',
      requesterName: '佐藤様（ご家族）',
      contactHint: null,
      occurredAt: '2026-01-25T20:00:00.000Z',
      receivedAt: '2026-01-27T09:00:00.000Z',
      dueAt: '2026-01-31T00:00:00.000Z', // 期限超過
      assigneeUserId: 'user_manager',
      ownerRole: null,
      resolutionSummary: null,
      rootCause: null,
      preventivePlan: null,
      relatedTicketId: null,
      relatedCommitteeActionId: null,
      createdByUserId: 'user_manager',
      createdAt: '2026-01-27T09:00:00.000Z',
      updatedAt: '2026-01-29T15:00:00.000Z',
      resolvedAt: null,
      closedAt: null,
    },
    {
      id: 'cmp_003',
      title: '請求書の金額が違う',
      description: '先月の請求書に記載のない追加料金が含まれている。事前説明なく請求されたことに不満。',
      category: 'billing',
      severity: 'medium',
      status: 'resolved',
      requesterType: 'family',
      requesterName: '田中様',
      contactHint: null,
      occurredAt: '2026-01-15T00:00:00.000Z',
      receivedAt: '2026-01-16T10:00:00.000Z',
      dueAt: '2026-01-23T00:00:00.000Z',
      assigneeUserId: 'user_manager',
      ownerRole: null,
      resolutionSummary: '請求書の誤りを確認し、訂正版を送付。差額は次月請求で調整。',
      rootCause: '料金改定の反映漏れ',
      preventivePlan: '請求前のダブルチェック体制を導入',
      relatedTicketId: null,
      relatedCommitteeActionId: null,
      createdByUserId: 'user_manager',
      createdAt: '2026-01-16T10:00:00.000Z',
      updatedAt: '2026-01-22T16:00:00.000Z',
      resolvedAt: '2026-01-22T16:00:00.000Z',
      closedAt: null,
    },
    {
      id: 'cmp_004',
      title: 'スタッフの対応が不適切',
      description: '介護スタッフの言葉遣いが乱暴で、利用者が怖がっていると報告。具体的なスタッフ名は伏せるが、夜勤帯のスタッフとのこと。',
      category: 'staff',
      severity: 'critical',
      status: 'triaging',
      requesterType: 'family',
      requesterName: null,
      contactHint: null,
      occurredAt: '2026-02-01T00:00:00.000Z',
      receivedAt: '2026-02-01T09:00:00.000Z',
      dueAt: '2026-02-03T00:00:00.000Z',
      assigneeUserId: null,
      ownerRole: 'manager',
      resolutionSummary: null,
      rootCause: null,
      preventivePlan: null,
      relatedTicketId: null,
      relatedCommitteeActionId: null,
      createdByUserId: 'user_executive',
      createdAt: '2026-02-01T09:00:00.000Z',
      updatedAt: '2026-02-01T09:00:00.000Z',
      resolvedAt: null,
      closedAt: null,
    },
    {
      id: 'cmp_005',
      title: '匿名：施設内の清掃が行き届いていない',
      description: '共用トイレや廊下にゴミが落ちていることが多い。衛生面が心配。',
      category: 'facility',
      severity: 'low',
      status: 'new',
      requesterType: 'anonymous',
      requesterName: null,
      contactHint: null,
      occurredAt: null,
      receivedAt: '2026-02-02T08:00:00.000Z',
      dueAt: null,
      assigneeUserId: null,
      ownerRole: null,
      resolutionSummary: null,
      rootCause: null,
      preventivePlan: null,
      relatedTicketId: null,
      relatedCommitteeActionId: null,
      createdByUserId: 'user_manager',
      createdAt: '2026-02-02T08:00:00.000Z',
      updatedAt: '2026-02-02T08:00:00.000Z',
      resolvedAt: null,
      closedAt: null,
    },
  ];

  for (const c of complaints) {
    complaintsStore.set(c.id, c);
    commentsStore.set(c.id, []);
  }

  // コメントサンプル
  const comments: ComplaintComment[] = [
    {
      id: 'cmpcmt_001',
      complaintId: 'cmp_001',
      userId: 'user_manager',
      message: '厨房責任者と面談実施。人員配置の見直しを検討中。',
      createdAt: '2026-01-29T10:00:00.000Z',
    },
    {
      id: 'cmpcmt_002',
      complaintId: 'cmp_001',
      userId: 'user_manager',
      message: 'ご家族へ電話で経過報告。来週までに改善策を提示予定。',
      createdAt: '2026-01-30T10:00:00.000Z',
    },
    {
      id: 'cmpcmt_003',
      complaintId: 'cmp_002',
      userId: 'user_manager',
      message: '当日の記録を確認中。夜勤者へのヒアリングを予定。',
      createdAt: '2026-01-29T15:00:00.000Z',
    },
  ];

  for (const cmt of comments) {
    const existing = commentsStore.get(cmt.complaintId) ?? [];
    existing.push(cmt);
    commentsStore.set(cmt.complaintId, existing);
  }

  // 是正アクションサンプル
  const actions: ComplaintAction[] = [
    {
      id: 'cmpact_001',
      complaintId: 'cmp_001',
      title: '配膳時間の見直しと人員補充の検討',
      ownerUserId: 'user_manager',
      dueAt: '2026-02-10T00:00:00.000Z',
      status: 'in_progress',
      createdAt: '2026-01-30T10:00:00.000Z',
      updatedAt: '2026-01-30T10:00:00.000Z',
    },
    {
      id: 'cmpact_002',
      complaintId: 'cmp_003',
      title: '請求書チェックリストの作成',
      ownerUserId: 'user_leader',
      dueAt: '2026-02-01T00:00:00.000Z',
      status: 'done',
      createdAt: '2026-01-20T10:00:00.000Z',
      updatedAt: '2026-01-25T14:00:00.000Z',
    },
  ];

  for (const a of actions) {
    actionsStore.set(a.id, a);
  }
}

// 初期化実行
initDemoData();
