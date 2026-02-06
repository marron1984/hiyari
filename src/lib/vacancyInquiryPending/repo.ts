/**
 * 空室問い合わせ pending リポジトリ
 *
 * Ticket 076: 空室問い合わせの軽量本人確認
 *
 * インメモリストア実装（本番ではFirestoreに置き換え）
 */

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

// ========== インメモリストア ==========

const pendingStore = new Map<string, VacancyInquiryPending>();
const verifyLogsStore: InquiryVerifyLog[] = [];
const rateLimitMap = new Map<string, number>(); // IP -> last request timestamp

let idCounter = 1;
let logIdCounter = 1;

function now(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `vip_${String(idCounter++).padStart(6, '0')}`;
}

// ========== トークン生成・検証 ==========

/**
 * 安全なトークンを生成（32バイト）
 */
function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * トークンをハッシュ化（SHA256）
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * IPアドレスをマスク（プライバシー保護）
 */
function maskIp(ip?: string): string | null {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return 'xxx.xxx.xxx.xxx';
}

// ========== レートリミット ==========

/**
 * 同一IPの連続送信をチェック
 */
export function checkRateLimit(ip?: string, email?: string): { allowed: boolean; waitSeconds?: number } {
  if (!ip && !email) return { allowed: true };

  const key = `${ip || 'unknown'}_${email || 'unknown'}`;
  const lastRequest = rateLimitMap.get(key);
  const nowTimestamp = Date.now();

  if (lastRequest) {
    const elapsed = (nowTimestamp - lastRequest) / 1000;
    if (elapsed < RATE_LIMIT_SECONDS) {
      return { allowed: false, waitSeconds: Math.ceil(RATE_LIMIT_SECONDS - elapsed) };
    }
  }

  rateLimitMap.set(key, nowTimestamp);
  return { allowed: true };
}

// ========== CRUD ==========

/**
 * pending 一覧取得
 */
export function listPending(
  filter: PendingListFilter = {}
): { items: VacancyInquiryPending[]; total: number } {
  let items = Array.from(pendingStore.values());

  if (filter.status) {
    items = items.filter((p) => p.status === filter.status);
  }
  if (filter.businessUnitId) {
    items = items.filter((p) => p.businessUnitId === filter.businessUnitId);
  }

  // 作成日時降順
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = items.length;

  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  items = items.slice(offset, offset + limit);

  return { items, total };
}

/**
 * pending 取得（ID）
 */
export function getPendingById(id: string): VacancyInquiryPending | null {
  return pendingStore.get(id) ?? null;
}

/**
 * pending 作成
 *
 * @returns 平文のトークン（URLに埋め込む用、DB保存はハッシュ）
 */
export function createPending(
  request: CreatePendingRequest,
  ip?: string,
  userAgent?: string
): { pending: VacancyInquiryPending; token: string } {
  const id = generateId();
  const timestamp = now();
  const token = generateToken();
  const tokenHash = hashToken(token);

  // 有効期限計算
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const pending: VacancyInquiryPending = {
    id,
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
    status: 'pending',
    createdAt: timestamp,
    ipHint: maskIp(ip),
    userAgent: userAgent?.slice(0, 200) ?? null,
    verifiedAt: null,
    verifiedIpHint: null,
    ticketId: null,
  };

  pendingStore.set(id, pending);

  return { pending, token };
}

/**
 * トークンで pending を検索・検証
 */
export function verifyToken(token: string): {
  success: true;
  pending: VacancyInquiryPending;
} | {
  success: false;
  error: string;
} {
  const tokenHash = hashToken(token);

  // ハッシュで検索
  const pending = Array.from(pendingStore.values()).find(
    (p) => p.tokenHash === tokenHash
  );

  if (!pending) {
    return { success: false, error: '無効な確認リンクです' };
  }

  if (pending.status === 'verified') {
    return { success: false, error: 'この問い合わせは既に確認済みです' };
  }

  if (pending.status === 'expired') {
    return { success: false, error: 'この確認リンクは期限切れです' };
  }

  // 期限切れチェック
  if (new Date(pending.expiresAt) < new Date()) {
    pending.status = 'expired';
    return { success: false, error: 'この確認リンクは期限切れです' };
  }

  return { success: true, pending };
}

/**
 * pending を verified に更新
 */
export function markAsVerified(
  id: string,
  ticketId: string,
  ip?: string,
  userAgent?: string
): VacancyInquiryPending | null {
  const pending = pendingStore.get(id);
  if (!pending) return null;

  const timestamp = now();

  pending.status = 'verified';
  pending.verifiedAt = timestamp;
  pending.verifiedIpHint = maskIp(ip);
  pending.ticketId = ticketId;

  // 確認ログを記録
  verifyLogsStore.push({
    id: `vvl_${String(logIdCounter++).padStart(6, '0')}`,
    pendingId: id,
    verifiedAt: timestamp,
    ipHint: maskIp(ip),
    userAgent: userAgent?.slice(0, 200) ?? null,
  });

  return pending;
}

/**
 * 期限切れの pending を一括更新（cron用）
 */
export function expireOldPending(): number {
  const nowDate = new Date();
  let count = 0;

  for (const pending of pendingStore.values()) {
    if (pending.status === 'pending' && new Date(pending.expiresAt) < nowDate) {
      pending.status = 'expired';
      count++;
    }
  }

  return count;
}

// ========== 統計 ==========

export function getPendingStats(): {
  pending: number;
  verified: number;
  expired: number;
} {
  const items = Array.from(pendingStore.values());
  return {
    pending: items.filter((p) => p.status === 'pending').length,
    verified: items.filter((p) => p.status === 'verified').length,
    expired: items.filter((p) => p.status === 'expired').length,
  };
}

// ========== URL生成 ==========

/**
 * 確認URL生成
 */
export function generateVerifyUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/vacancies/verify?token=${encodeURIComponent(token)}`;
}
