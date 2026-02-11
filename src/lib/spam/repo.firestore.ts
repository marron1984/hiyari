/**
 * 迷惑フィルタ Firestoreリポジトリ
 *
 * PROD: Cloud Firestore永続化
 *
 * コレクション:
 * - spam_rules: NGワード/正規表現ルール
 * - spam_blocklist: ブロックリスト
 * - spam_events: スパムイベントログ
 *
 * 注意: レートカウンターはFirestoreに保存せず、インメモリで管理する
 * （短命なカウンターをFirestoreに書くとコスト増のため）
 */

import { createHash } from 'crypto';
import { getAdminDb } from '../firebase-admin';
import type {
  SpamRule,
  BlocklistEntry,
  SpamEvent,
  RateCounter,
  SpamCheckResult,
  SpamCheckContext,
  SpamCheckPayload,
  BlocklistKind,
  SpamSeverity,
} from './types';
import {
  IP_RATE_LIMIT,
  EMAIL_RATE_LIMIT,
  PHONE_RATE_LIMIT,
} from './types';

// ========== 定数 ==========

const RULES_COLLECTION = 'spam_rules';
const BLOCKLIST_COLLECTION = 'spam_blocklist';
const EVENTS_COLLECTION = 'spam_events';

// ========== レートカウンター（インメモリ） ==========

const rateCountersStore = new Map<string, RateCounter>();

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== ドキュメント変換 ==========

function docToSpamRule(doc: FirebaseFirestore.DocumentSnapshot): SpamRule {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    type: d.type ?? 'ng_word',
    pattern: d.pattern ?? '',
    enabled: d.enabled ?? true,
    severity: d.severity ?? 'warn',
    description: d.description,
    createdAt: d.createdAt ?? now(),
    updatedAt: d.updatedAt ?? now(),
  };
}

function docToBlocklistEntry(doc: FirebaseFirestore.DocumentSnapshot): BlocklistEntry {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    kind: d.kind ?? 'ip',
    valueHash: d.valueHash ?? '',
    reason: d.reason ?? '',
    expiresAt: d.expiresAt ?? null,
    createdAt: d.createdAt ?? now(),
    createdByUserId: d.createdByUserId ?? '',
  };
}

function docToSpamEvent(doc: FirebaseFirestore.DocumentSnapshot): SpamEvent {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    occurredAt: d.occurredAt ?? now(),
    action: d.action ?? 'allow',
    reason: d.reason ?? '',
    ipHint: d.ipHint ?? null,
    userAgentHash: d.userAgentHash ?? null,
    emailHash: d.emailHash ?? null,
    phoneHash: d.phoneHash ?? null,
    payloadHint: d.payloadHint ?? null,
    path: d.path ?? '',
    ruleId: d.ruleId ?? null,
  };
}

// ========== ハッシュ関数 ==========

/**
 * 値をSHA256ハッシュ化（ブロックリスト照合用）
 */
export function hashValue(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

/**
 * メールアドレスを正規化してハッシュ
 */
export function hashEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  return hashValue(normalized);
}

/**
 * 電話番号を正規化してハッシュ
 */
export function hashPhone(phone: string): string {
  const normalized = phone.replace(/\D/g, '');
  return hashValue(normalized);
}

/**
 * IPをマスク（ログ用）
 */
export function maskIp(ip?: string): string | null {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return 'xxx.xxx.xxx.xxx';
}

/**
 * UserAgentをハッシュ（短縮）
 */
export function hashUserAgent(ua?: string): string | null {
  if (!ua) return null;
  return hashValue(ua).slice(0, 16);
}

// ========== ルールCRUD ==========

export async function listRules(enabled?: boolean): Promise<SpamRule[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(RULES_COLLECTION);

  if (enabled !== undefined) {
    query = query.where('enabled', '==', enabled);
  }

  const snapshot = await query.get();
  const rules = snapshot.docs.map(docToSpamRule);
  return rules.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getRuleById(id: string): Promise<SpamRule | null> {
  const db = getAdminDb();
  const doc = await db.collection(RULES_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return docToSpamRule(doc);
}

export async function createRule(
  input: Omit<SpamRule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<SpamRule> {
  const db = getAdminDb();
  const id = generateId('spr');
  const timestamp = now();

  const rule: SpamRule = {
    id,
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(RULES_COLLECTION).doc(id).set(rule);
  return rule;
}

export async function updateRule(
  id: string,
  patch: Partial<Pick<SpamRule, 'pattern' | 'enabled' | 'severity' | 'description'>>
): Promise<SpamRule | null> {
  const db = getAdminDb();
  const docRef = db.collection(RULES_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const existing = docToSpamRule(doc);

  const updated: SpamRule = {
    ...existing,
    ...(patch.pattern !== undefined ? { pattern: patch.pattern } : {}),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    updatedAt: now(),
  };

  await docRef.set(updated);
  return updated;
}

export async function deleteRule(id: string): Promise<boolean> {
  const db = getAdminDb();
  const docRef = db.collection(RULES_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  await docRef.delete();
  return true;
}

// ========== ブロックリストCRUD ==========

export async function listBlocklist(kind?: BlocklistKind): Promise<BlocklistEntry[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(BLOCKLIST_COLLECTION);

  if (kind) {
    query = query.where('kind', '==', kind);
  }

  const snapshot = await query.get();
  let entries = snapshot.docs.map(docToBlocklistEntry);

  // 期限切れを除外
  const nowDate = new Date();
  entries = entries.filter(
    (e) => e.expiresAt === null || new Date(e.expiresAt) > nowDate
  );

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addToBlocklist(
  kind: BlocklistKind,
  value: string,
  reason: string,
  expiresAt: string | null,
  actorUserId: string
): Promise<BlocklistEntry> {
  const db = getAdminDb();
  const id = generateId('spb');
  const valueHash =
    kind === 'email'
      ? hashEmail(value)
      : kind === 'phone'
        ? hashPhone(value)
        : hashValue(value);

  const entry: BlocklistEntry = {
    id,
    kind,
    valueHash,
    reason,
    expiresAt,
    createdAt: now(),
    createdByUserId: actorUserId,
  };

  await db.collection(BLOCKLIST_COLLECTION).doc(id).set(entry);
  return entry;
}

export async function removeFromBlocklist(id: string): Promise<boolean> {
  const db = getAdminDb();
  const docRef = db.collection(BLOCKLIST_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  await docRef.delete();
  return true;
}

/**
 * ブロックリストに一致するかチェック
 */
export async function isBlocked(
  kind: BlocklistKind,
  value: string
): Promise<{ blocked: boolean; entry?: BlocklistEntry }> {
  const valueHash =
    kind === 'email'
      ? hashEmail(value)
      : kind === 'phone'
        ? hashPhone(value)
        : hashValue(value);

  const db = getAdminDb();
  const snapshot = await db
    .collection(BLOCKLIST_COLLECTION)
    .where('kind', '==', kind)
    .where('valueHash', '==', valueHash)
    .get();

  const nowDate = new Date();

  for (const doc of snapshot.docs) {
    const entry = docToBlocklistEntry(doc);
    // 期限チェック
    if (entry.expiresAt !== null && new Date(entry.expiresAt) <= nowDate) {
      continue;
    }
    return { blocked: true, entry };
  }

  return { blocked: false };
}

// ========== イベントログ ==========

export async function logSpamEvent(
  event: Omit<SpamEvent, 'id' | 'occurredAt'>
): Promise<SpamEvent> {
  const db = getAdminDb();
  const id = generateId('spe');

  const spamEvent: SpamEvent = {
    id,
    occurredAt: now(),
    ...event,
  };

  await db.collection(EVENTS_COLLECTION).doc(id).set(spamEvent);

  return spamEvent;
}

export async function listSpamEvents(limit: number = 100): Promise<SpamEvent[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(EVENTS_COLLECTION)
    .orderBy('occurredAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(docToSpamEvent);
}

export async function getSpamEventStats(): Promise<{
  total: number;
  byAction: Record<string, number>;
}> {
  const db = getAdminDb();
  const snapshot = await db.collection(EVENTS_COLLECTION).get();

  const byAction: Record<string, number> = {
    allow: 0,
    warn: 0,
    throttle: 0,
    block: 0,
  };

  for (const doc of snapshot.docs) {
    const event = docToSpamEvent(doc);
    byAction[event.action] = (byAction[event.action] ?? 0) + 1;
  }

  return {
    total: snapshot.size,
    byAction,
  };
}

// ========== レートリミット ==========

/**
 * レートリミットをチェック (インメモリ - Firestoreに保存しない)
 */
export function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; count: number; resetAt: string } {
  const nowTime = Date.now();
  const counter = rateCountersStore.get(key);

  if (!counter || new Date(counter.resetAt).getTime() <= nowTime) {
    const resetAt = new Date(nowTime + windowMs).toISOString();
    rateCountersStore.set(key, { key, count: 1, resetAt });
    return { allowed: true, count: 1, resetAt };
  }

  counter.count++;

  if (counter.count > maxRequests) {
    return { allowed: false, count: counter.count, resetAt: counter.resetAt };
  }

  return { allowed: true, count: counter.count, resetAt: counter.resetAt };
}

/**
 * 古いカウンターをクリーンアップ
 */
export function cleanupRateCounters(): number {
  const nowTime = Date.now();
  let cleaned = 0;

  for (const [key, counter] of rateCountersStore.entries()) {
    if (new Date(counter.resetAt).getTime() <= nowTime) {
      rateCountersStore.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

// ========== シードデータ ==========

export async function seedSpamRulesIfEmpty(): Promise<void> {
  const db = getAdminDb();
  const snapshot = await db.collection(RULES_COLLECTION).limit(1).get();
  if (!snapshot.empty) return;

  // デフォルトNGワード
  const defaultNgWords = [
    { pattern: '詐欺', severity: 'block' as SpamSeverity, description: '詐欺関連' },
    { pattern: '出会い系', severity: 'block' as SpamSeverity, description: '出会い系' },
    { pattern: 'http://', severity: 'warn' as SpamSeverity, description: 'URL含む（要確認）' },
    { pattern: 'https://', severity: 'warn' as SpamSeverity, description: 'URL含む（要確認）' },
  ];

  for (const ngWord of defaultNgWords) {
    await createRule({
      type: 'ng_word',
      pattern: ngWord.pattern,
      enabled: true,
      severity: ngWord.severity,
      description: ngWord.description,
    });
  }

  // デフォルト正規表現（攻撃パターン）
  const defaultRegexes = [
    { pattern: '<script[^>]*>', severity: 'block' as SpamSeverity, description: 'XSS攻撃' },
    { pattern: 'javascript:', severity: 'block' as SpamSeverity, description: 'XSS攻撃' },
    { pattern: 'onload\\s*=', severity: 'block' as SpamSeverity, description: 'XSS攻撃' },
    { pattern: 'SELECT\\s+.*\\s+FROM', severity: 'block' as SpamSeverity, description: 'SQL Injection' },
  ];

  for (const regex of defaultRegexes) {
    await createRule({
      type: 'regex',
      pattern: regex.pattern,
      enabled: true,
      severity: regex.severity,
      description: regex.description,
    });
  }
}
