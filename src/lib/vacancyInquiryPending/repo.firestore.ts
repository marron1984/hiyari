/**
 * 空室問い合わせ pending リポジトリ（Firestore版）
 *
 * Ticket 076: 空室問い合わせの軽量本人確認
 *
 * Firestore永続化実装
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { createHash, randomBytes } from 'crypto';
import type {
  VacancyInquiryPending,
  CreatePendingRequest,
  PendingListFilter,
  InquiryVerifyLog,
} from './types';
import {
  TOKEN_EXPIRY_MINUTES,
  RATE_LIMIT_SECONDS,
  TOKEN_BYTES,
} from './types';

// ========== コレクション名 ==========

const PENDING_COLLECTION = 'vacancy_inquiry_pending';
const VERIFY_LOGS_COLLECTION = 'vacancy_inquiry_verify_logs';
const RATE_LIMIT_COLLECTION = 'vacancy_inquiry_rate_limits';

// ========== ドキュメント変換 ==========

function docToPending(doc: FirebaseFirestore.DocumentSnapshot): VacancyInquiryPending {
  const d = doc.data()!;
  return {
    id: doc.id,
    businessUnitId: d.businessUnitId,
    vacancyUnitId: d.vacancyUnitId ?? null,
    contactEmail: d.contactEmail ?? null,
    contactPhone: d.contactPhone ?? null,
    contactName: d.contactName ?? null,
    desiredMoveIn: d.desiredMoveIn ?? null,
    conditionsJson: d.conditionsJson ?? {},
    memo: d.memo ?? null,
    ref: d.ref ?? null,
    refName: d.refName ?? null,
    tokenHash: d.tokenHash,
    expiresAt: d.expiresAt,
    status: d.status,
    createdAt: d.createdAt,
    ipHint: d.ipHint ?? null,
    userAgent: d.userAgent ?? null,
    verifiedAt: d.verifiedAt ?? null,
    verifiedIpHint: d.verifiedIpHint ?? null,
    ticketId: d.ticketId ?? null,
  };
}

// ========== トークン生成・検証 ==========

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function maskIp(ip?: string): string | null {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return 'xxx.xxx.xxx.xxx';
}

function now(): string {
  return new Date().toISOString();
}

// ========== レートリミット ==========

export async function checkRateLimit(ip?: string, email?: string): Promise<{ allowed: boolean; waitSeconds?: number }> {
  if (!ip && !email) return { allowed: true };

  const key = `${ip || 'unknown'}_${email || 'unknown'}`;
  const db = getAdminDb();
  const docRef = db.collection(RATE_LIMIT_COLLECTION).doc(key);

  const doc = await docRef.get();
  const nowTimestamp = Date.now();

  if (doc.exists) {
    const lastRequest = doc.data()!.lastRequestAt as number;
    const elapsed = (nowTimestamp - lastRequest) / 1000;
    if (elapsed < RATE_LIMIT_SECONDS) {
      return { allowed: false, waitSeconds: Math.ceil(RATE_LIMIT_SECONDS - elapsed) };
    }
  }

  await docRef.set({ lastRequestAt: nowTimestamp }, { merge: true });
  return { allowed: true };
}

// ========== CRUD ==========

export async function listPending(
  filter: PendingListFilter = {}
): Promise<{ items: VacancyInquiryPending[]; total: number }> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(PENDING_COLLECTION);

  if (filter.status) {
    query = query.where('status', '==', filter.status);
  }
  if (filter.businessUnitId) {
    query = query.where('businessUnitId', '==', filter.businessUnitId);
  }

  query = query.orderBy('createdAt', 'desc');

  const snapshot = await query.get();
  const allItems = snapshot.docs.map(docToPending);

  const total = allItems.length;
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  const items = allItems.slice(offset, offset + limit);

  return { items, total };
}

export async function getPendingById(id: string): Promise<VacancyInquiryPending | null> {
  const db = getAdminDb();
  const doc = await db.collection(PENDING_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return docToPending(doc);
}

export async function createPending(
  request: CreatePendingRequest,
  ip?: string,
  userAgent?: string
): Promise<{ pending: VacancyInquiryPending; token: string }> {
  const db = getAdminDb();
  const timestamp = now();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const docRef = db.collection(PENDING_COLLECTION).doc();

  const pendingData = {
    businessUnitId: request.businessUnitId,
    vacancyUnitId: request.vacancyUnitId ?? null,
    contactEmail: request.contactEmail ?? null,
    contactPhone: request.contactPhone ?? null,
    contactName: request.contactName ?? null,
    desiredMoveIn: request.desiredMoveIn ?? null,
    conditionsJson: request.conditionsJson ?? {},
    memo: request.memo ?? null,
    ref: request.ref ?? null,
    refName: request.refName ?? null,
    tokenHash,
    expiresAt,
    status: 'pending' as const,
    createdAt: timestamp,
    ipHint: maskIp(ip),
    userAgent: userAgent?.slice(0, 200) ?? null,
    verifiedAt: null,
    verifiedIpHint: null,
    ticketId: null,
  };

  await docRef.set(pendingData);

  const pending: VacancyInquiryPending = {
    id: docRef.id,
    ...pendingData,
  };

  return { pending, token };
}

export async function verifyToken(token: string): Promise<
  | { success: true; pending: VacancyInquiryPending }
  | { success: false; error: string }
> {
  const tokenHash = hashToken(token);
  const db = getAdminDb();

  const snapshot = await db
    .collection(PENDING_COLLECTION)
    .where('tokenHash', '==', tokenHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return { success: false, error: '無効な確認リンクです' };
  }

  const doc = snapshot.docs[0];
  const pending = docToPending(doc);

  if (pending.status === 'verified') {
    return { success: false, error: 'この問い合わせは既に確認済みです' };
  }

  if (pending.status === 'expired') {
    return { success: false, error: 'この確認リンクは期限切れです' };
  }

  // 期限切れチェック
  if (new Date(pending.expiresAt) < new Date()) {
    await db.collection(PENDING_COLLECTION).doc(pending.id).update({ status: 'expired' });
    return { success: false, error: 'この確認リンクは期限切れです' };
  }

  return { success: true, pending };
}

export async function markAsVerified(
  id: string,
  ticketId: string,
  ip?: string,
  userAgent?: string
): Promise<VacancyInquiryPending | null> {
  const db = getAdminDb();
  const docRef = db.collection(PENDING_COLLECTION).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const timestamp = now();

  await docRef.update({
    status: 'verified',
    verifiedAt: timestamp,
    verifiedIpHint: maskIp(ip),
    ticketId,
  });

  // 確認ログを記録
  const logRef = db.collection(VERIFY_LOGS_COLLECTION).doc();
  await logRef.set({
    pendingId: id,
    verifiedAt: timestamp,
    ipHint: maskIp(ip),
    userAgent: userAgent?.slice(0, 200) ?? null,
  });

  const updatedDoc = await docRef.get();
  return docToPending(updatedDoc);
}

export async function expireOldPending(): Promise<number> {
  const db = getAdminDb();
  const nowDate = new Date().toISOString();

  const snapshot = await db
    .collection(PENDING_COLLECTION)
    .where('status', '==', 'pending')
    .where('expiresAt', '<', nowDate)
    .get();

  let count = 0;
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { status: 'expired' });
    count++;
  }

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

// ========== 統計 ==========

export async function getPendingStats(): Promise<{
  pending: number;
  verified: number;
  expired: number;
}> {
  const db = getAdminDb();
  const snapshot = await db.collection(PENDING_COLLECTION).get();

  let pending = 0;
  let verified = 0;
  let expired = 0;

  for (const doc of snapshot.docs) {
    const status = doc.data().status;
    if (status === 'pending') pending++;
    else if (status === 'verified') verified++;
    else if (status === 'expired') expired++;
  }

  return { pending, verified, expired };
}

// ========== URL生成 ==========

export function generateVerifyUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/vacancies/verify?token=${encodeURIComponent(token)}`;
}
