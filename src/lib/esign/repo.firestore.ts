/**
 * 電子署名ログ Firestoreリポジトリ
 *
 * PROD-003: 本番永続化
 *
 * コレクション: esign_envelopes, esign_events
 *
 * 対応関数:
 * - listESignRecords / getESignRecordById: 閲覧
 * - createESignRecord / updateESignRecord / changeStatus: CRUD
 * - getESignEvents / getAllESignEvents: 監査ログ
 * - getStats / getOverdueRecords / getExpiringSoonRecords: 統計・スキャン
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type { AppRole } from '@/config/appRoles';
import type {
  ESignRecord,
  ESignEvent,
  ESignStats,
  CreateESignRecordInput,
  UpdateESignRecordInput,
  ListESignRecordsFilter,
  SignStatus,
  SignEventAction,
} from './types';
import {
  canViewESignRecords,
  canViewAllESignRecords,
  canCreateESignRecord,
  canUpdateESignRecord,
  canSearchBySubjectName,
  maskSubjectName,
  isOverdue,
  isExpiringSoon,
} from './types';

// ========== 定数 ==========

const ENVELOPES_COLLECTION = 'esign_envelopes';
const EVENTS_COLLECTION = 'esign_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== ビューアーコンテキスト ==========

export interface ViewerContext {
  userId: string;
  role: AppRole;
}

// ========== ドキュメント変換 ==========

function docToRecord(doc: FirebaseFirestore.DocumentSnapshot): ESignRecord | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    subjectType: data.subjectType ?? 'other',
    subjectId: data.subjectId ?? null,
    subjectName: data.subjectName ?? '',
    documentId: data.documentId ?? null,
    documentVersionId: data.documentVersionId ?? null,
    agreementConsentId: data.agreementConsentId ?? null,
    contractId: data.contractId ?? null,
    status: data.status ?? 'requested',
    method: data.method ?? 'other',
    requestedAt: data.requestedAt ?? null,
    signedAt: data.signedAt ?? null,
    expiresAt: data.expiresAt ?? null,
    recordedByUserId: data.recordedByUserId ?? null,
    note: data.note ?? null,
    externalProvider: data.externalProvider ?? 'none',
    externalEnvelopeId: data.externalEnvelopeId ?? null,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): ESignEvent | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    recordId: data.recordId ?? '',
    actorUserId: data.actorUserId ?? null,
    action: data.action ?? 'update',
    beforeJson: data.beforeJson ?? null,
    afterJson: data.afterJson ?? null,
    createdAt: data.createdAt ?? now(),
    note: data.note ?? null,
  };
}

// ========== 監査ログ ==========

async function logEvent(
  recordId: string,
  action: SignEventAction,
  actorUserId: string | null,
  beforeData: unknown | null,
  afterData: unknown | null,
  note: string | null = null
): Promise<void> {
  try {
    const db = getAdminDb();
    const eventId = generateId('esev');
    const event: ESignEvent = {
      id: eventId,
      recordId,
      actorUserId,
      action,
      beforeJson: beforeData ? JSON.stringify(beforeData) : null,
      afterJson: afterData ? JSON.stringify(afterData) : null,
      createdAt: now(),
      note,
    };
    await db.collection(EVENTS_COLLECTION).doc(eventId).set(event);
  } catch (error) {
    console.error('[ESign:Firestore] logEvent error:', error);
  }
}

// ========== CRUD操作 ==========

/**
 * 署名レコード一覧取得
 */
export async function listESignRecords(
  viewer: ViewerContext,
  filter: ListESignRecordsFilter = {}
): Promise<{ records: ESignRecord[]; total: number }> {
  if (!canViewESignRecords(viewer.role)) {
    return { records: [], total: 0 };
  }

  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(ENVELOPES_COLLECTION);

    if (filter.status) {
      query = query.where('status', '==', filter.status);
    }
    if (filter.subjectType) {
      query = query.where('subjectType', '==', filter.subjectType);
    }
    if (filter.documentId) {
      query = query.where('documentId', '==', filter.documentId);
    }

    const snap = await query.get();
    let items = snap.docs.map((d) => docToRecord(d)!).filter(Boolean);

    // staff/leader は自分のレコードのみ
    if (!canViewAllESignRecords(viewer.role)) {
      items = items.filter(
        (r) => r.subjectType === 'staff' && r.subjectId === viewer.userId
      );
    }

    // expiringWithinDays フィルタ
    if (filter.expiringWithinDays !== undefined && filter.expiringWithinDays > 0) {
      items = items.filter((r) => isExpiringSoon(r, filter.expiringWithinDays));
    }

    // 検索（manager以上のみ）
    if (filter.q && canSearchBySubjectName(viewer.role)) {
      const q = filter.q.toLowerCase();
      items = items.filter((r) => r.subjectName.toLowerCase().includes(q));
    }

    // ソート（新しい順）
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = items.length;

    // ページネーション
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    items = items.slice(offset, offset + limit);

    // PIIマスク（staff/leader向け）
    if (!canViewAllESignRecords(viewer.role)) {
      items = items.map((r) => ({
        ...r,
        subjectName: r.subjectId === viewer.userId ? r.subjectName : maskSubjectName(r.subjectName),
      }));
    }

    return { records: items, total };
  } catch (error) {
    console.error('[ESign:Firestore] listESignRecords error:', error);
    return { records: [], total: 0 };
  }
}

/**
 * 署名レコード取得（ID指定）
 */
export async function getESignRecordById(
  id: string,
  viewer: ViewerContext
): Promise<ESignRecord | null> {
  if (!canViewESignRecords(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();
    const doc = await db.collection(ENVELOPES_COLLECTION).doc(id).get();
    const record = docToRecord(doc);
    if (!record) return null;

    // staff/leader は自分のレコードのみ
    if (!canViewAllESignRecords(viewer.role)) {
      if (!(record.subjectType === 'staff' && record.subjectId === viewer.userId)) {
        return null;
      }
    }

    return record;
  } catch (error) {
    console.error('[ESign:Firestore] getESignRecordById error:', error);
    return null;
  }
}

/**
 * 署名レコード作成
 */
export async function createESignRecord(
  input: CreateESignRecordInput,
  actorUserId: string,
  actorRole: AppRole
): Promise<{ success: true; record: ESignRecord } | { success: false; error: string }> {
  if (!canCreateESignRecord(actorRole)) {
    return { success: false, error: '署名ログ作成権限がありません' };
  }

  if (!input.subjectName?.trim()) {
    return { success: false, error: '署名者名は必須です' };
  }

  try {
    const db = getAdminDb();
    const timestamp = now();
    const recordId = generateId('esig');

    const record: ESignRecord = {
      id: recordId,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      subjectName: input.subjectName.trim(),
      documentId: input.documentId ?? null,
      documentVersionId: input.documentVersionId ?? null,
      agreementConsentId: input.agreementConsentId ?? null,
      contractId: input.contractId ?? null,
      status: input.status ?? 'requested',
      method: input.method,
      requestedAt: input.requestedAt ?? (input.status === 'requested' || !input.status ? timestamp : null),
      signedAt: input.signedAt ?? (input.status === 'signed' ? timestamp : null),
      expiresAt: input.expiresAt ?? null,
      recordedByUserId: actorUserId,
      note: input.note ?? null,
      externalProvider: input.externalProvider ?? 'none',
      externalEnvelopeId: input.externalEnvelopeId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.collection(ENVELOPES_COLLECTION).doc(recordId).set(record);
    await logEvent(recordId, 'create', actorUserId, null, record);

    return { success: true, record };
  } catch (error) {
    console.error('[ESign:Firestore] createESignRecord error:', error);
    return { success: false, error: '署名レコードの作成に失敗しました' };
  }
}

/**
 * 署名レコード更新
 */
export async function updateESignRecord(
  id: string,
  input: UpdateESignRecordInput,
  actorUserId: string,
  actorRole: AppRole
): Promise<{ success: true; record: ESignRecord } | { success: false; error: string }> {
  if (!canUpdateESignRecord(actorRole)) {
    return { success: false, error: '署名ログ更新権限がありません' };
  }

  try {
    const db = getAdminDb();
    const docRef = db.collection(ENVELOPES_COLLECTION).doc(id);
    const doc = await docRef.get();
    const record = docToRecord(doc);

    if (!record) {
      return { success: false, error: '署名レコードが見つかりません' };
    }

    const before = { ...record };
    const patch: Record<string, unknown> = { updatedAt: now() };

    if (input.subjectName !== undefined) {
      patch.subjectName = input.subjectName.trim();
    }
    if (input.method !== undefined) {
      patch.method = input.method;
    }
    if (input.expiresAt !== undefined) {
      patch.expiresAt = input.expiresAt;
    }
    if (input.note !== undefined) {
      patch.note = input.note;
    }

    await docRef.update(patch);

    const updatedDoc = await docRef.get();
    const updated = docToRecord(updatedDoc)!;

    await logEvent(id, 'update', actorUserId, before, updated);

    return { success: true, record: updated };
  } catch (error) {
    console.error('[ESign:Firestore] updateESignRecord error:', error);
    return { success: false, error: '署名レコードの更新に失敗しました' };
  }
}

/**
 * ステータス変更
 */
export async function changeStatus(
  id: string,
  newStatus: SignStatus,
  actorUserId: string,
  actorRole: AppRole,
  note?: string
): Promise<{ success: true; record: ESignRecord } | { success: false; error: string }> {
  if (!canUpdateESignRecord(actorRole)) {
    return { success: false, error: '署名ログ更新権限がありません' };
  }

  try {
    const db = getAdminDb();
    const docRef = db.collection(ENVELOPES_COLLECTION).doc(id);
    const doc = await docRef.get();
    const record = docToRecord(doc);

    if (!record) {
      return { success: false, error: '署名レコードが見つかりません' };
    }

    const before = { ...record };
    const oldStatus = record.status;
    const timestamp = now();

    const patch: Record<string, unknown> = {
      status: newStatus,
      updatedAt: timestamp,
    };

    // ステータスに応じた日時更新
    if (newStatus === 'signed' && !record.signedAt) {
      patch.signedAt = timestamp;
    }

    await docRef.update(patch);

    const updatedDoc = await docRef.get();
    const updated = docToRecord(updatedDoc)!;

    // アクション決定
    let action: SignEventAction = 'update';
    if (newStatus === 'signed') action = 'sign';
    else if (newStatus === 'declined') action = 'decline';
    else if (newStatus === 'voided') action = 'void';
    else if (newStatus === 'expired') action = 'expire';
    else if (newStatus === 'requested' && oldStatus !== 'requested') action = 'request';

    await logEvent(id, action, actorUserId, before, updated, note ?? null);

    return { success: true, record: updated };
  } catch (error) {
    console.error('[ESign:Firestore] changeStatus error:', error);
    return { success: false, error: 'ステータス変更に失敗しました' };
  }
}

// ========== 監査ログ取得 ==========

/**
 * 監査ログ取得
 */
export async function getESignEvents(recordId: string): Promise<ESignEvent[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(EVENTS_COLLECTION)
      .where('recordId', '==', recordId)
      .orderBy('createdAt', 'desc')
      .get();

    return snap.docs.map((d) => docToEvent(d)!).filter(Boolean);
  } catch (error) {
    console.error('[ESign:Firestore] getESignEvents error:', error);
    return [];
  }
}

/**
 * 全監査ログ取得（監査ビュー用）
 */
export async function getAllESignEvents(limit: number = 1000): Promise<ESignEvent[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(EVENTS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map((d) => docToEvent(d)!).filter(Boolean);
  } catch (error) {
    console.error('[ESign:Firestore] getAllESignEvents error:', error);
    return [];
  }
}

// ========== 統計 ==========

/**
 * 統計情報取得
 */
export async function getStats(viewer: ViewerContext): Promise<ESignStats | null> {
  if (!canViewAllESignRecords(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection(ENVELOPES_COLLECTION).get();
    const records = snap.docs.map((d) => docToRecord(d)!).filter(Boolean);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return {
      totalRequested: records.filter((r) => r.status === 'requested').length,
      totalSigned: records.filter((r) => r.status === 'signed').length,
      totalDeclined: records.filter((r) => r.status === 'declined').length,
      totalVoided: records.filter((r) => r.status === 'voided').length,
      totalExpired: records.filter((r) => r.status === 'expired').length,
      expiringWithin7Days: records.filter((r) => isExpiringSoon(r, 7)).length,
      signedThisMonth: records.filter(
        (r) => r.status === 'signed' && r.signedAt && new Date(r.signedAt) >= startOfMonth
      ).length,
    };
  } catch (error) {
    console.error('[ESign:Firestore] getStats error:', error);
    return null;
  }
}

// ========== スキャン ==========

/**
 * 期限超過レコード取得（アラート用）
 */
export async function getOverdueRecords(): Promise<ESignRecord[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(ENVELOPES_COLLECTION)
      .where('status', '==', 'requested')
      .get();

    return snap.docs
      .map((d) => docToRecord(d)!)
      .filter(Boolean)
      .filter(isOverdue);
  } catch (error) {
    console.error('[ESign:Firestore] getOverdueRecords error:', error);
    return [];
  }
}

/**
 * 期限間近レコード取得（通知用）
 */
export async function getExpiringSoonRecords(days: number = 7): Promise<ESignRecord[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(ENVELOPES_COLLECTION)
      .where('status', '==', 'requested')
      .get();

    return snap.docs
      .map((d) => docToRecord(d)!)
      .filter(Boolean)
      .filter((r) => isExpiringSoon(r, days));
  } catch (error) {
    console.error('[ESign:Firestore] getExpiringSoonRecords error:', error);
    return [];
  }
}
