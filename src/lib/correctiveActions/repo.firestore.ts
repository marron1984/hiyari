/**
 * 是正措置（Corrective Actions）Firestoreリポジトリ
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション:
 * - corrective_actions: 是正措置本体
 * - corrective_action_updates: 更新ログ（将来拡張用）
 * - corrective_action_events: 監査ログ
 *
 * Task 030: businessUnitId によるスコープ対応
 * Ticket 131: ブロック/ブロック解除
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  CorrectiveAction,
  CorrectiveActionStatus,
  CorrectiveActionSeverity,
  CorrectiveActionListFilter,
  CorrectiveActionStats,
  CreateCorrectiveActionRequest,
  UpdateCorrectiveActionRequest,
  ViewerContext,
  BlockCorrectiveActionRequest,
  CorrectiveActionEvent,
  CorrectiveActionEventAction,
} from './types';
import { canViewCorrectiveAction, canManageCorrectiveAction } from './types';

// ========== 定数 ==========

const CA_COLLECTION = 'corrective_actions';
const EVENTS_COLLECTION = 'corrective_action_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `ca_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateEventId(): string {
  return `ca_ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const DEMO_USERS: Record<string, string> = {
  user_001: '山田太郎',
  user_002: '佐藤次郎',
  user_003: '鈴木花子',
  user_manager: '田中管理者',
};

function getUserName(userId: string): string {
  return DEMO_USERS[userId] ?? userId;
}

function isOverdue(ca: CorrectiveAction): boolean {
  if (!ca.dueAt) return false;
  if (['completed', 'closed', 'cancelled'].includes(ca.status)) return false;
  return new Date(ca.dueAt) < new Date();
}

// ========== ドキュメント変換 ==========

function docToCorrectiveAction(doc: FirebaseFirestore.DocumentSnapshot): CorrectiveAction {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    title: data.title ?? '',
    description: data.description ?? '',
    status: data.status ?? 'open',
    severity: data.severity ?? 'minor',
    sourceType: data.sourceType ?? 'manual',
    sourceId: data.sourceId ?? null,
    businessUnitId: data.businessUnitId ?? null,
    rootCause: data.rootCause ?? null,
    actionPlan: data.actionPlan ?? null,
    ownerUserId: data.ownerUserId ?? null,
    ownerUserName: data.ownerUserName ?? null,
    createdByUserId: data.createdByUserId ?? '',
    createdByUserName: data.createdByUserName ?? '',
    dueAt: data.dueAt ?? null,
    completedAt: data.completedAt ?? null,
    verifiedAt: data.verifiedAt ?? null,
    verifiedByUserId: data.verifiedByUserId ?? null,
    verifiedByUserName: data.verifiedByUserName ?? null,
    meta: data.meta ?? null,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): CorrectiveActionEvent {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    correctiveActionId: data.correctiveActionId ?? '',
    action: data.action ?? 'created',
    actorUserId: data.actorUserId ?? '',
    before: data.before ?? undefined,
    after: data.after ?? undefined,
    note: data.note ?? undefined,
    createdAt: data.createdAt ?? now(),
  };
}

// ========== イベント記録 ==========

async function addEvent(
  correctiveActionId: string,
  action: CorrectiveActionEventAction,
  actorUserId: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
  note?: string
): Promise<CorrectiveActionEvent> {
  const db = getAdminDb();
  const eventId = generateEventId();
  const event: CorrectiveActionEvent = {
    id: eventId,
    correctiveActionId,
    action,
    actorUserId,
    before,
    after,
    note,
    createdAt: now(),
  };

  try {
    await db.collection(EVENTS_COLLECTION).doc(eventId).set(event);
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] addEvent error:', error);
  }

  return event;
}

// ========== 一覧取得 ==========

export async function listCorrectiveActions(
  viewer: ViewerContext,
  filter: CorrectiveActionListFilter
): Promise<{ items: CorrectiveAction[]; total: number }> {
  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(CA_COLLECTION);

    // Firestoreフィルタ
    if (filter.status) {
      query = query.where('status', '==', filter.status);
    }
    if (filter.severity) {
      query = query.where('severity', '==', filter.severity);
    }
    if (filter.sourceType) {
      query = query.where('sourceType', '==', filter.sourceType);
    }

    const snapshot = await query.get();
    let items = snapshot.docs.map(docToCorrectiveAction);

    // RBAC
    if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
      items = items.filter((ca) => canViewCorrectiveAction(ca, viewer));
    }

    // Task 030: 事業単位フィルタ
    if (filter.businessUnitId !== undefined) {
      if (filter.businessUnitId === null) {
        items = items.filter((ca) => ca.businessUnitId === null);
      } else {
        items = items.filter((ca) => ca.businessUnitId === filter.businessUnitId);
      }
    }

    // 期限超過フィルタ
    if (filter.overdue) {
      items = items.filter(isOverdue);
    }

    // 検索
    if (filter.q) {
      const q = filter.q.toLowerCase();
      items = items.filter(
        (ca) =>
          ca.title.toLowerCase().includes(q) ||
          ca.description.toLowerCase().includes(q) ||
          (ca.rootCause && ca.rootCause.toLowerCase().includes(q))
      );
    }

    // ソート: severity (critical優先) → updatedAt降順
    const severityOrder: Record<CorrectiveActionSeverity, number> = {
      critical: 0,
      major: 1,
      minor: 2,
    };
    items.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const total = items.length;

    // ページネーション
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    items = items.slice(offset, offset + limit);

    return { items, total };
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] listCorrectiveActions error:', error);
    return { items: [], total: 0 };
  }
}

// ========== 詳細取得 ==========

export async function getById(
  id: string,
  viewer: ViewerContext
): Promise<{ success: true; item: CorrectiveAction } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(CA_COLLECTION).doc(id).get();

    if (!doc.exists) {
      return { success: false, error: '是正措置が見つかりません' };
    }

    const ca = docToCorrectiveAction(doc);
    if (!canViewCorrectiveAction(ca, viewer)) {
      return { success: false, error: '閲覧権限がありません' };
    }

    return { success: true, item: ca };
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] getById error:', error);
    return { success: false, error: '取得に失敗しました' };
  }
}

// ========== 作成 ==========

import {
  tryAutoAssign,
  addToUnassignedQueue,
  removeFromUnassignedQueue,
} from '@/lib/assignment/autoAssign';

export async function create(
  input: CreateCorrectiveActionRequest,
  actorUserId: string,
  options: { skipAutoAssign?: boolean } = {}
): Promise<CorrectiveAction> {
  const db = getAdminDb();
  const timestamp = now();
  const caId = generateId();

  // Task 057: 自動担当者割当（ownerUserIdが未指定の場合）
  let ownerUserId = input.ownerUserId ?? null;
  let ownerUserName = input.ownerUserId ? getUserName(input.ownerUserId) : null;

  if (!ownerUserId && !options.skipAutoAssign) {
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      minor: 'low',
      moderate: 'medium',
      major: 'high',
      critical: 'critical',
    };

    const assignResult = await tryAutoAssign({
      entityType: 'correctiveAction',
      entityId: caId,
      businessUnitId: input.businessUnitId ?? null,
      severity: severityMap[input.severity ?? 'minor'] ?? 'low',
      createdByUserId: actorUserId,
    });

    if (assignResult.ok && assignResult.wasAssigned) {
      ownerUserId = assignResult.assigneeUserId;
      ownerUserName = getUserName(assignResult.assigneeUserId);
    } else if (!assignResult.ok) {
      // 未割当キューに追加
      addToUnassignedQueue(
        'correctiveAction',
        caId,
        input.businessUnitId ?? null,
        assignResult.reason,
        actorUserId
      );
    }
  }

  const ca: CorrectiveAction = {
    id: caId,
    title: input.title,
    description: input.description,
    status: 'open',
    severity: input.severity ?? 'minor',
    sourceType: input.sourceType ?? 'manual',
    sourceId: input.sourceId ?? null,
    businessUnitId: input.businessUnitId ?? null,
    rootCause: input.rootCause ?? null,
    actionPlan: input.actionPlan ?? null,
    ownerUserId,
    ownerUserName,
    createdByUserId: actorUserId,
    createdByUserName: getUserName(actorUserId),
    dueAt: input.dueAt ?? null,
    completedAt: null,
    verifiedAt: null,
    verifiedByUserId: null,
    verifiedByUserName: null,
    meta: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(CA_COLLECTION).doc(caId).set(ca);

  return ca;
}

// ========== 更新 ==========

export async function update(
  id: string,
  patch: UpdateCorrectiveActionRequest,
  viewer: ViewerContext
): Promise<{ success: true; item: CorrectiveAction } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CA_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '是正措置が見つかりません' };
    }

    const ca = docToCorrectiveAction(doc);
    if (!canManageCorrectiveAction(viewer) && ca.ownerUserId !== viewer.userId) {
      return { success: false, error: '更新権限がありません' };
    }

    const updated: CorrectiveAction = {
      ...ca,
      ...patch,
      ownerUserName: patch.ownerUserId !== undefined
        ? (patch.ownerUserId ? getUserName(patch.ownerUserId) : null)
        : ca.ownerUserName,
      updatedAt: now(),
    };

    await docRef.set(updated);

    return { success: true, item: updated };
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] update error:', error);
    return { success: false, error: '更新に失敗しました' };
  }
}

// ========== ステータス変更 ==========

export async function changeStatus(
  id: string,
  newStatus: CorrectiveActionStatus,
  viewer: ViewerContext
): Promise<{ success: true; item: CorrectiveAction } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CA_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '是正措置が見つかりません' };
    }

    const ca = docToCorrectiveAction(doc);
    if (!canManageCorrectiveAction(viewer) && ca.ownerUserId !== viewer.userId) {
      return { success: false, error: 'ステータス変更権限がありません' };
    }

    ca.status = newStatus;
    ca.updatedAt = now();

    if (newStatus === 'completed') {
      ca.completedAt = ca.updatedAt;
    }

    await docRef.set(ca);

    return { success: true, item: ca };
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] changeStatus error:', error);
    return { success: false, error: 'ステータス変更に失敗しました' };
  }
}

// ========== 検証（完了確認） ==========

export async function verify(
  id: string,
  viewer: ViewerContext
): Promise<{ success: true; item: CorrectiveAction } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CA_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '是正措置が見つかりません' };
    }

    const ca = docToCorrectiveAction(doc);
    if (!canManageCorrectiveAction(viewer)) {
      return { success: false, error: '検証権限がありません' };
    }

    ca.verifiedAt = now();
    ca.verifiedByUserId = viewer.userId;
    ca.verifiedByUserName = getUserName(viewer.userId);
    ca.status = 'closed';
    ca.updatedAt = ca.verifiedAt;

    await docRef.set(ca);

    return { success: true, item: ca };
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] verify error:', error);
    return { success: false, error: '検証に失敗しました' };
  }
}

// ========== 統計 ==========

export interface CorrectiveActionStatsOptions {
  businessUnitId?: string | null;
}

export async function getStats(
  viewer: ViewerContext,
  options?: CorrectiveActionStatsOptions
): Promise<CorrectiveActionStats> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(CA_COLLECTION).get();
    let items = snapshot.docs.map(docToCorrectiveAction);

    // RBAC
    if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
      items = items.filter((ca) => canViewCorrectiveAction(ca, viewer));
    }

    // Task 030: 事業単位フィルタ
    if (options?.businessUnitId !== undefined) {
      if (options.businessUnitId === null) {
        items = items.filter((ca) => ca.businessUnitId === null);
      } else {
        items = items.filter((ca) => ca.businessUnitId === options.businessUnitId);
      }
    }

    const openStatuses: CorrectiveActionStatus[] = ['open', 'in_progress', 'blocked', 'pending_review'];
    const openItems = items.filter((ca) => openStatuses.includes(ca.status));
    const criticalOpen = openItems.filter((ca) => ca.severity === 'critical').length;
    const overdueCount = items.filter(isOverdue).length;

    // 今月完了
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const completedThisMonth = items.filter(
      (ca) => ca.completedAt && new Date(ca.completedAt) >= monthStart
    ).length;

    // 平均完了日数
    const completedWithDuration = items
      .filter((ca) => ca.completedAt)
      .map((ca) => {
        const created = new Date(ca.createdAt).getTime();
        const completed = new Date(ca.completedAt!).getTime();
        return (completed - created) / (1000 * 60 * 60 * 24);
      });

    const avgCompletionDays =
      completedWithDuration.length > 0
        ? Math.round(
            completedWithDuration.reduce((a, b) => a + b, 0) / completedWithDuration.length
          )
        : null;

    return {
      total: items.length,
      open: openItems.length,
      criticalOpen,
      overdue: overdueCount,
      completedThisMonth,
      avgCompletionDays,
    };
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] getStats error:', error);
    return {
      total: 0,
      open: 0,
      criticalOpen: 0,
      overdue: 0,
      completedThisMonth: 0,
      avgCompletionDays: null,
    };
  }
}

// ========== 重大オープンスキャン ==========

export async function scanCriticalOpen(): Promise<CorrectiveAction[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection(CA_COLLECTION)
      .where('severity', '==', 'critical')
      .get();

    const openStatuses: CorrectiveActionStatus[] = ['open', 'in_progress', 'blocked', 'pending_review'];
    return snapshot.docs
      .map(docToCorrectiveAction)
      .filter((ca) => openStatuses.includes(ca.status));
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] scanCriticalOpen error:', error);
    return [];
  }
}

// ========== イベント取得 ==========

export async function listEvents(correctiveActionId: string): Promise<CorrectiveActionEvent[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection(EVENTS_COLLECTION)
      .where('correctiveActionId', '==', correctiveActionId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(docToEvent);
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] listEvents error:', error);
    return [];
  }
}

// ========== Ticket 131: ブロック/ブロック解除 ==========

export async function blockAction(
  id: string,
  request: BlockCorrectiveActionRequest,
  viewer: ViewerContext
): Promise<{ success: true; item: CorrectiveAction; event: CorrectiveActionEvent } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CA_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '是正措置が見つかりません' };
    }

    const ca = docToCorrectiveAction(doc);
    if (!canManageCorrectiveAction(viewer) && ca.ownerUserId !== viewer.userId) {
      return { success: false, error: 'ブロック権限がありません' };
    }

    // blocked に変更できるステータス
    const blockableStatuses: CorrectiveActionStatus[] = ['open', 'in_progress', 'pending_review'];
    if (!blockableStatuses.includes(ca.status)) {
      return { success: false, error: `現在のステータス（${ca.status}）からブロックに変更できません` };
    }

    const beforeState = { status: ca.status, meta: ca.meta };

    ca.status = 'blocked';
    ca.meta = {
      ...(ca.meta ?? {}),
      blockedReasonCode: request.blockedReasonCode,
      blockedReasonNote: request.blockedReasonNote ?? null,
      nextReviewAt: request.nextReviewAt ?? null,
      blockedAt: now(),
      blockedByUserId: viewer.userId,
    };
    ca.updatedAt = now();

    const afterState = { status: ca.status, meta: ca.meta };

    await docRef.set(ca);

    const event = await addEvent(
      id,
      'blocked',
      viewer.userId,
      beforeState,
      afterState,
      `理由: ${request.blockedReasonCode}${request.blockedReasonNote ? ` / ${request.blockedReasonNote}` : ''}`
    );

    return { success: true, item: ca, event };
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] blockAction error:', error);
    return { success: false, error: 'ブロック処理に失敗しました' };
  }
}

export async function unblockAction(
  id: string,
  newStatus: 'open' | 'in_progress',
  viewer: ViewerContext
): Promise<{ success: true; item: CorrectiveAction; event: CorrectiveActionEvent } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CA_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '是正措置が見つかりません' };
    }

    const ca = docToCorrectiveAction(doc);
    if (!canManageCorrectiveAction(viewer) && ca.ownerUserId !== viewer.userId) {
      return { success: false, error: 'ブロック解除権限がありません' };
    }

    if (ca.status !== 'blocked') {
      return { success: false, error: '現在ブロック中ではありません' };
    }

    const beforeState = { status: ca.status, meta: ca.meta };

    ca.status = newStatus;
    // meta の blocked 情報はクリアせず履歴として残す
    ca.meta = {
      ...(ca.meta ?? {}),
      unblockedAt: now(),
      unblockedByUserId: viewer.userId,
    };
    ca.updatedAt = now();

    const afterState = { status: ca.status, meta: ca.meta };

    await docRef.set(ca);

    const event = await addEvent(
      id,
      'unblocked',
      viewer.userId,
      beforeState,
      afterState,
      `ブロック解除 → ${newStatus}`
    );

    return { success: true, item: ca, event };
  } catch (error) {
    console.error('[CorrectiveActions:Firestore] unblockAction error:', error);
    return { success: false, error: 'ブロック解除に失敗しました' };
  }
}
