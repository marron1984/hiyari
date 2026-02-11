/**
 * クレーム対応 Firestoreリポジトリ
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション:
 * - complaints: クレーム本体
 * - complaint_comments: コメント
 * - complaint_actions: 是正アクション
 * - complaint_events: 監査ログ
 */

import { getAdminDb } from '@/lib/firebase-admin';
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

// ========== 定数 ==========

const COMPLAINTS_COLLECTION = 'complaints';
const COMMENTS_COLLECTION = 'complaint_comments';
const ACTIONS_COLLECTION = 'complaint_actions';
const EVENTS_COLLECTION = 'complaint_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== ドキュメント変換 ==========

function docToComplaint(doc: FirebaseFirestore.DocumentSnapshot): Complaint {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    title: data.title ?? '',
    description: data.description ?? '',
    category: data.category ?? 'other',
    severity: data.severity ?? 'low',
    status: data.status ?? 'new',
    requesterType: data.requesterType ?? 'other',
    requesterName: data.requesterName ?? null,
    contactHint: data.contactHint ?? null,
    occurredAt: data.occurredAt ?? null,
    receivedAt: data.receivedAt ?? now(),
    dueAt: data.dueAt ?? null,
    assigneeUserId: data.assigneeUserId ?? null,
    ownerRole: data.ownerRole ?? null,
    resolutionSummary: data.resolutionSummary ?? null,
    rootCause: data.rootCause ?? null,
    preventivePlan: data.preventivePlan ?? null,
    relatedTicketId: data.relatedTicketId ?? null,
    relatedCommitteeActionId: data.relatedCommitteeActionId ?? null,
    createdByUserId: data.createdByUserId ?? '',
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
    resolvedAt: data.resolvedAt ?? null,
    closedAt: data.closedAt ?? null,
  };
}

function docToComment(doc: FirebaseFirestore.DocumentSnapshot): ComplaintComment {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    complaintId: data.complaintId ?? '',
    userId: data.userId ?? '',
    message: data.message ?? '',
    createdAt: data.createdAt ?? now(),
  };
}

function docToAction(doc: FirebaseFirestore.DocumentSnapshot): ComplaintAction {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    complaintId: data.complaintId ?? '',
    title: data.title ?? '',
    ownerUserId: data.ownerUserId ?? null,
    dueAt: data.dueAt ?? null,
    status: data.status ?? 'open',
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): ComplaintEvent {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    complaintId: data.complaintId ?? '',
    actorUserId: data.actorUserId ?? null,
    action: data.action ?? 'create',
    beforeJson: data.beforeJson ?? null,
    afterJson: data.afterJson ?? null,
    createdAt: data.createdAt ?? now(),
    note: data.note ?? null,
  };
}

// ========== 監査ログ記録 ==========

async function recordEvent(
  complaintId: string,
  action: ComplaintEvent['action'],
  actorUserId: string | null,
  beforeJson: Record<string, unknown> | null,
  afterJson: Record<string, unknown> | null,
  note: string | null
): Promise<void> {
  try {
    const db = getAdminDb();
    const eventId = generateId('cmpev');
    const event: ComplaintEvent = {
      id: eventId,
      complaintId,
      actorUserId,
      action,
      beforeJson,
      afterJson,
      createdAt: now(),
      note,
    };
    await db.collection(EVENTS_COLLECTION).doc(eventId).set(event);
  } catch (error) {
    console.error('[Complaints:Firestore] recordEvent error:', error);
  }
}

// ========== クレーム管理 ==========

export async function listComplaints(
  viewer: ViewerContext,
  filter: ListComplaintsFilter = {}
): Promise<{ complaints: Complaint[]; total: number }> {
  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(COMPLAINTS_COLLECTION);

    // Firestoreフィルタ（単一フィールド）
    if (filter.status) {
      query = query.where('status', '==', filter.status);
    }
    if (filter.severity) {
      query = query.where('severity', '==', filter.severity);
    }
    if (filter.category) {
      query = query.where('category', '==', filter.category);
    }

    const snapshot = await query.get();
    let complaints = snapshot.docs.map(docToComplaint);

    // RBAC: manager未満は自分が担当のもののみ
    if (!canManageComplaints(viewer) && viewer.role !== 'auditor') {
      complaints = complaints.filter((c) => c.assigneeUserId === viewer.userId);
    }

    // メモリ内フィルタリング
    const currentTime = new Date();

    if (filter.overdue === true) {
      complaints = complaints.filter(
        (c) =>
          c.dueAt &&
          new Date(c.dueAt) < currentTime &&
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
  } catch (error) {
    console.error('[Complaints:Firestore] listComplaints error:', error);
    return { complaints: [], total: 0 };
  }
}

export async function getComplaintById(
  id: string,
  viewer: ViewerContext
): Promise<Complaint | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(COMPLAINTS_COLLECTION).doc(id).get();
    if (!doc.exists) return null;

    const complaint = docToComplaint(doc);

    // RBAC
    if (!canViewComplaint(viewer, complaint)) {
      return null;
    }

    return complaint;
  } catch (error) {
    console.error('[Complaints:Firestore] getComplaintById error:', error);
    return null;
  }
}

export async function createComplaint(
  input: CreateComplaintInput,
  actorUserId: string
): Promise<{ success: true; complaint: Complaint } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const timestamp = now();
    const complaintId = generateId('cmp');

    const complaint: Complaint = {
      id: complaintId,
      title: input.title,
      description: input.description,
      category: input.category,
      severity: input.severity,
      status: 'new',
      requesterType: input.requesterType,
      requesterName: input.requesterName ?? null,
      contactHint: input.contactHint ?? null,
      occurredAt: input.occurredAt ?? null,
      receivedAt: timestamp,
      dueAt: input.dueAt ?? null,
      assigneeUserId: null,
      ownerRole: null,
      resolutionSummary: null,
      rootCause: null,
      preventivePlan: null,
      relatedTicketId: null,
      relatedCommitteeActionId: null,
      createdByUserId: actorUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
      closedAt: null,
    };

    await db.collection(COMPLAINTS_COLLECTION).doc(complaintId).set(complaint);
    await recordEvent(complaintId, 'create', actorUserId, null, { ...complaint }, null);

    return { success: true, complaint };
  } catch (error) {
    console.error('[Complaints:Firestore] createComplaint error:', error);
    return { success: false, error: 'クレームの作成に失敗しました' };
  }
}

export async function updateComplaint(
  id: string,
  patch: UpdateComplaintInput,
  actorUserId: string
): Promise<{ success: true; complaint: Complaint } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COMPLAINTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: 'クレームが見つかりません' };
    }

    const complaint = docToComplaint(doc);
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

    complaint.updatedAt = now();

    await docRef.set(complaint);

    if (Object.keys(after).length > 0) {
      await recordEvent(id, 'update_fields', actorUserId, before, after, null);
    }

    return { success: true, complaint };
  } catch (error) {
    console.error('[Complaints:Firestore] updateComplaint error:', error);
    return { success: false, error: 'クレームの更新に失敗しました' };
  }
}

export async function assignComplaint(
  id: string,
  assigneeUserId: string | null,
  actorUserId: string
): Promise<{ success: true; complaint: Complaint } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COMPLAINTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: 'クレームが見つかりません' };
    }

    const complaint = docToComplaint(doc);
    const before = { assigneeUserId: complaint.assigneeUserId };
    complaint.assigneeUserId = assigneeUserId;
    complaint.updatedAt = now();

    await docRef.set(complaint);
    await recordEvent(id, 'assign', actorUserId, before, { assigneeUserId }, null);

    return { success: true, complaint };
  } catch (error) {
    console.error('[Complaints:Firestore] assignComplaint error:', error);
    return { success: false, error: '担当の割当に失敗しました' };
  }
}

export async function setDueAt(
  id: string,
  dueAt: string | null,
  actorUserId: string
): Promise<{ success: true; complaint: Complaint } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COMPLAINTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: 'クレームが見つかりません' };
    }

    const complaint = docToComplaint(doc);
    const before = { dueAt: complaint.dueAt };
    complaint.dueAt = dueAt;
    complaint.updatedAt = now();

    await docRef.set(complaint);
    await recordEvent(id, 'set_due', actorUserId, before, { dueAt }, null);

    return { success: true, complaint };
  } catch (error) {
    console.error('[Complaints:Firestore] setDueAt error:', error);
    return { success: false, error: '期限の設定に失敗しました' };
  }
}

export async function changeStatus(
  id: string,
  status: ComplaintStatus,
  actorUserId: string
): Promise<{ success: true; complaint: Complaint } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COMPLAINTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: 'クレームが見つかりません' };
    }

    const complaint = docToComplaint(doc);
    const before = {
      status: complaint.status,
      resolvedAt: complaint.resolvedAt,
      closedAt: complaint.closedAt,
    };
    const oldStatus = complaint.status;
    complaint.status = status;
    complaint.updatedAt = now();

    // resolved/closed の日時を更新
    if (status === 'resolved' && oldStatus !== 'resolved') {
      complaint.resolvedAt = now();
    }
    if (status === 'closed' && oldStatus !== 'closed') {
      complaint.closedAt = now();
    }

    await docRef.set(complaint);

    const action =
      status === 'resolved'
        ? 'mark_resolved'
        : status === 'closed'
        ? 'close'
        : isOpenStatus(status) && !isOpenStatus(oldStatus)
        ? 'reopen'
        : 'status_change';

    await recordEvent(
      id,
      action,
      actorUserId,
      before,
      { status, resolvedAt: complaint.resolvedAt, closedAt: complaint.closedAt },
      null
    );

    return { success: true, complaint };
  } catch (error) {
    console.error('[Complaints:Firestore] changeStatus error:', error);
    return { success: false, error: 'ステータスの変更に失敗しました' };
  }
}

// ========== コメント管理 ==========

export async function listComments(complaintId: string): Promise<ComplaintComment[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection(COMMENTS_COLLECTION)
      .where('complaintId', '==', complaintId)
      .orderBy('createdAt', 'asc')
      .get();

    return snapshot.docs.map(docToComment);
  } catch (error) {
    console.error('[Complaints:Firestore] listComments error:', error);
    return [];
  }
}

export async function addComment(
  complaintId: string,
  message: string,
  actorUserId: string
): Promise<{ success: true; comment: ComplaintComment } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COMPLAINTS_COLLECTION).doc(complaintId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: 'クレームが見つかりません' };
    }

    const commentId = generateId('cmpcmt');
    const comment: ComplaintComment = {
      id: commentId,
      complaintId,
      userId: actorUserId,
      message,
      createdAt: now(),
    };

    await db.collection(COMMENTS_COLLECTION).doc(commentId).set(comment);

    // クレームのupdatedAtを更新
    await docRef.update({ updatedAt: now() });

    await recordEvent(complaintId, 'add_comment', actorUserId, null, { commentId: comment.id }, null);

    return { success: true, comment };
  } catch (error) {
    console.error('[Complaints:Firestore] addComment error:', error);
    return { success: false, error: 'コメントの追加に失敗しました' };
  }
}

// ========== 是正アクション管理 ==========

export async function listActions(complaintId: string): Promise<ComplaintAction[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection(ACTIONS_COLLECTION)
      .where('complaintId', '==', complaintId)
      .orderBy('createdAt', 'asc')
      .get();

    return snapshot.docs.map(docToAction);
  } catch (error) {
    console.error('[Complaints:Firestore] listActions error:', error);
    return [];
  }
}

export async function createAction(
  complaintId: string,
  input: CreateComplaintActionInput,
  actorUserId: string
): Promise<{ success: true; action: ComplaintAction } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const complaintDoc = await db.collection(COMPLAINTS_COLLECTION).doc(complaintId).get();

    if (!complaintDoc.exists) {
      return { success: false, error: 'クレームが見つかりません' };
    }

    const timestamp = now();
    const actionId = generateId('cmpact');
    const action: ComplaintAction = {
      id: actionId,
      complaintId,
      title: input.title,
      ownerUserId: input.ownerUserId ?? null,
      dueAt: input.dueAt ?? null,
      status: 'open',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.collection(ACTIONS_COLLECTION).doc(actionId).set(action);

    return { success: true, action };
  } catch (error) {
    console.error('[Complaints:Firestore] createAction error:', error);
    return { success: false, error: 'アクションの作成に失敗しました' };
  }
}

export async function updateAction(
  actionId: string,
  patch: UpdateComplaintActionInput,
  actorUserId: string
): Promise<{ success: true; action: ComplaintAction } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(ACTIONS_COLLECTION).doc(actionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: 'アクションが見つかりません' };
    }

    const action = docToAction(doc);
    const actionRecord = action as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        actionRecord[key] = value;
      }
    }
    action.updatedAt = now();

    await docRef.set(action);

    return { success: true, action };
  } catch (error) {
    console.error('[Complaints:Firestore] updateAction error:', error);
    return { success: false, error: 'アクションの更新に失敗しました' };
  }
}

export async function changeActionStatus(
  actionId: string,
  status: ComplaintActionStatus,
  actorUserId: string
): Promise<{ success: true; action: ComplaintAction } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(ACTIONS_COLLECTION).doc(actionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: 'アクションが見つかりません' };
    }

    const action = docToAction(doc);
    action.status = status;
    action.updatedAt = now();

    await docRef.set(action);

    return { success: true, action };
  } catch (error) {
    console.error('[Complaints:Firestore] changeActionStatus error:', error);
    return { success: false, error: 'ステータスの変更に失敗しました' };
  }
}

// ========== 統計 ==========

export async function getStats(viewer: ViewerContext): Promise<ComplaintStats> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COMPLAINTS_COLLECTION).get();
    let complaints = snapshot.docs.map(docToComplaint);
    const currentTime = new Date();
    const thisMonth = new Date(currentTime.getFullYear(), currentTime.getMonth(), 1);

    // RBAC: manager未満は自分の担当のみ
    if (!canManageComplaints(viewer) && viewer.role !== 'auditor') {
      complaints = complaints.filter((c) => c.assigneeUserId === viewer.userId);
    }

    const open = complaints.filter((c) => isOpenStatus(c.status)).length;
    const criticalOpen = complaints.filter(
      (c) => c.severity === 'critical' && isOpenStatus(c.status)
    ).length;
    const overdue = complaints.filter(
      (c) => c.dueAt && new Date(c.dueAt) < currentTime && isOpenStatus(c.status)
    ).length;
    const myAssignedOpen = complaints.filter(
      (c) => c.assigneeUserId === viewer.userId && isOpenStatus(c.status)
    ).length;

    // 今月解決
    const resolvedThisMonth = complaints.filter(
      (c) => c.resolvedAt && new Date(c.resolvedAt) >= thisMonth
    ).length;

    // 平均解決日数（今月解決分）
    const resolvedWithTime = complaints.filter(
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
  } catch (error) {
    console.error('[Complaints:Firestore] getStats error:', error);
    return {
      open: 0,
      criticalOpen: 0,
      overdue: 0,
      myAssignedOpen: 0,
      resolvedThisMonth: 0,
      avgDaysToResolve: null,
    };
  }
}

// ========== リスク検知 ==========

export async function scanCriticalOpen(): Promise<Complaint[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection(COMPLAINTS_COLLECTION)
      .where('severity', '==', 'critical')
      .get();

    const complaints = snapshot.docs.map(docToComplaint);
    return complaints.filter((c) => isOpenStatus(c.status));
  } catch (error) {
    console.error('[Complaints:Firestore] scanCriticalOpen error:', error);
    return [];
  }
}

export async function scanOverdue(): Promise<Complaint[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COMPLAINTS_COLLECTION).get();
    const currentTime = new Date();

    return snapshot.docs
      .map(docToComplaint)
      .filter(
        (c) => c.dueAt && new Date(c.dueAt) < currentTime && isOpenStatus(c.status)
      );
  } catch (error) {
    console.error('[Complaints:Firestore] scanOverdue error:', error);
    return [];
  }
}

// ========== イベント取得 ==========

export async function getEvents(complaintId: string): Promise<ComplaintEvent[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection(EVENTS_COLLECTION)
      .where('complaintId', '==', complaintId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(docToEvent);
  } catch (error) {
    console.error('[Complaints:Firestore] getEvents error:', error);
    return [];
  }
}
