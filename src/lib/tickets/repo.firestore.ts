/**
 * チケット Firestoreリポジトリ（最小実装）
 *
 * PROD-003: 本番永続化
 *
 * vacancy_inquiry チケットの永続化に必要な最小関数のみ:
 * - saveTicket: Firestoreに保存（docId=relatedId で冪等）
 * - findByRelatedId: relatedType+relatedId でチケットを検索
 * - getById: docIdでチケット取得
 * - listByFilter: 最低限のフィルタ検索
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { Ticket, TicketListFilter, ViewerContext } from './types';

const TICKETS_COLLECTION = 'tickets';

/**
 * チケット保存（Firestore永続化）
 *
 * vacancy_inquiry: docId = relatedId（冪等性をdocIdで保証）
 * その他: docId = ticket.id
 */
export async function saveTicket(ticket: Ticket): Promise<void> {
  const db = getAdminDb();
  const docId =
    ticket.relatedType === 'vacancy_inquiry' && ticket.relatedId
      ? ticket.relatedId
      : ticket.id;

  await db
    .collection(TICKETS_COLLECTION)
    .doc(docId)
    .set(
      {
        ...ticket,
        _createdAt: Timestamp.fromDate(new Date(ticket.createdAt)),
        _updatedAt: Timestamp.fromDate(new Date(ticket.updatedAt)),
      },
      { merge: false }
    );
}

/**
 * relatedId でチケットを取得（冪等性チェック）
 *
 * vacancy_inquiry は docId=relatedId なので point read で高速
 */
export async function findByRelatedId(
  relatedType: string,
  relatedId: string
): Promise<Ticket | null> {
  const db = getAdminDb();

  // vacancy_inquiry は docId = relatedId → point read
  if (relatedType === 'vacancy_inquiry') {
    const doc = await db.collection(TICKETS_COLLECTION).doc(relatedId).get();
    if (doc.exists) {
      return docToTicket(doc);
    }
    return null;
  }

  // その他: クエリ
  const snap = await db
    .collection(TICKETS_COLLECTION)
    .where('relatedType', '==', relatedType)
    .where('relatedId', '==', relatedId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return docToTicket(snap.docs[0]);
}

/**
 * IDでチケット取得
 */
export async function getById(id: string): Promise<Ticket | null> {
  const db = getAdminDb();
  const doc = await db.collection(TICKETS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return docToTicket(doc);
}

/**
 * フィルタ検索（最小実装）
 *
 * 対応フィルタ: businessUnitId, relatedType, relatedId, status, limit
 */
export async function listByFilter(
  filter: TicketListFilter,
  _viewer: ViewerContext
): Promise<{ items: Ticket[]; total: number }> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(TICKETS_COLLECTION);

  if (filter.relatedType) {
    q = q.where('relatedType', '==', filter.relatedType);
  }
  if (filter.relatedId) {
    q = q.where('relatedId', '==', filter.relatedId);
  }
  if (filter.businessUnitId !== undefined) {
    if (filter.businessUnitId === null) {
      q = q.where('businessUnitId', '==', null);
    } else {
      q = q.where('businessUnitId', '==', filter.businessUnitId);
    }
  }
  if (filter.status) {
    q = q.where('status', '==', filter.status);
  }

  q = q.orderBy('_createdAt', 'desc');
  q = q.limit(filter.limit ?? 50);

  const snap = await q.get();
  const items = snap.docs.map(docToTicket);

  return { items, total: items.length };
}

// ========== ヘルパー ==========

function docToTicket(
  doc: FirebaseFirestore.DocumentSnapshot
): Ticket {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    title: data.title ?? '',
    description: data.description ?? '',
    status: data.status ?? 'open',
    priority: data.priority ?? 'normal',
    category: data.category ?? 'general',
    businessUnitId: data.businessUnitId ?? null,
    requesterUserId: data.requesterUserId ?? 'system',
    requesterUserName: data.requesterUserName,
    assigneeUserId: data.assigneeUserId ?? null,
    assigneeUserName: data.assigneeUserName ?? null,
    assigneeRole: data.assigneeRole ?? null,
    dueAt: data.dueAt ?? null,
    resolvedAt: data.resolvedAt ?? null,
    closedAt: data.closedAt ?? null,
    tagsJson: data.tagsJson ?? null,
    metaJson: data.metaJson ?? data.meta ?? null,
    relatedType: data.relatedType ?? null,
    relatedId: data.relatedId ?? null,
    location: data.location ?? null,
    pipeline: data.pipeline ?? null,
    stage: data.stage ?? null,
    slaDueAt: data.slaDueAt ?? null,
    stageChangedAt: data.stageChangedAt ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}
