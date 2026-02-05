/**
 * 迷惑フィルタ リポジトリ
 *
 * Ticket 077: 迷惑フィルタ（NGワード/連投/ブラックリスト）
 *
 * インメモリストア実装（本番ではFirestoreに置き換え）
 */

import { createHash } from 'crypto';
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

// ========== インメモリストア ==========

const rulesStore = new Map<string, SpamRule>();
const blocklistStore = new Map<string, BlocklistEntry>();
const eventsStore: SpamEvent[] = [];
const rateCountersStore = new Map<string, RateCounter>();

let ruleIdCounter = 1;
let blocklistIdCounter = 1;
let eventIdCounter = 1;

function now(): string {
  return new Date().toISOString();
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
  // 小文字化、空白除去
  const normalized = email.toLowerCase().trim();
  return hashValue(normalized);
}

/**
 * 電話番号を正規化してハッシュ
 */
export function hashPhone(phone: string): string {
  // 数字のみ抽出
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

export function listRules(enabled?: boolean): SpamRule[] {
  let rules = Array.from(rulesStore.values());
  if (enabled !== undefined) {
    rules = rules.filter((r) => r.enabled === enabled);
  }
  return rules.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getRuleById(id: string): SpamRule | null {
  return rulesStore.get(id) ?? null;
}

export function createRule(
  input: Omit<SpamRule, 'id' | 'createdAt' | 'updatedAt'>
): SpamRule {
  const id = `spr_${String(ruleIdCounter++).padStart(6, '0')}`;
  const timestamp = now();

  const rule: SpamRule = {
    id,
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  rulesStore.set(id, rule);
  return rule;
}

export function updateRule(
  id: string,
  patch: Partial<Pick<SpamRule, 'pattern' | 'enabled' | 'severity' | 'description'>>
): SpamRule | null {
  const rule = rulesStore.get(id);
  if (!rule) return null;

  if (patch.pattern !== undefined) rule.pattern = patch.pattern;
  if (patch.enabled !== undefined) rule.enabled = patch.enabled;
  if (patch.severity !== undefined) rule.severity = patch.severity;
  if (patch.description !== undefined) rule.description = patch.description;
  rule.updatedAt = now();

  return rule;
}

export function deleteRule(id: string): boolean {
  return rulesStore.delete(id);
}

// ========== ブロックリストCRUD ==========

export function listBlocklist(kind?: BlocklistKind): BlocklistEntry[] {
  let entries = Array.from(blocklistStore.values());
  if (kind) {
    entries = entries.filter((e) => e.kind === kind);
  }
  // 期限切れを除外
  const nowDate = new Date();
  entries = entries.filter(
    (e) => e.expiresAt === null || new Date(e.expiresAt) > nowDate
  );
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addToBlocklist(
  kind: BlocklistKind,
  value: string,
  reason: string,
  expiresAt: string | null,
  actorUserId: string
): BlocklistEntry {
  const id = `spb_${String(blocklistIdCounter++).padStart(6, '0')}`;
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

  blocklistStore.set(id, entry);
  return entry;
}

export function removeFromBlocklist(id: string): boolean {
  return blocklistStore.delete(id);
}

/**
 * ブロックリストに一致するかチェック
 */
export function isBlocked(
  kind: BlocklistKind,
  value: string
): { blocked: boolean; entry?: BlocklistEntry } {
  const valueHash =
    kind === 'email'
      ? hashEmail(value)
      : kind === 'phone'
        ? hashPhone(value)
        : hashValue(value);

  const nowDate = new Date();

  for (const entry of blocklistStore.values()) {
    if (entry.kind !== kind) continue;
    if (entry.valueHash !== valueHash) continue;
    // 期限チェック
    if (entry.expiresAt !== null && new Date(entry.expiresAt) <= nowDate) {
      continue;
    }
    return { blocked: true, entry };
  }

  return { blocked: false };
}

// ========== イベントログ ==========

export function logSpamEvent(
  event: Omit<SpamEvent, 'id' | 'occurredAt'>
): SpamEvent {
  const id = `spe_${String(eventIdCounter++).padStart(6, '0')}`;

  const spamEvent: SpamEvent = {
    id,
    occurredAt: now(),
    ...event,
  };

  eventsStore.push(spamEvent);

  // メモリ節約：1000件を超えたら古いものを削除
  if (eventsStore.length > 1000) {
    eventsStore.shift();
  }

  return spamEvent;
}

export function listSpamEvents(limit: number = 100): SpamEvent[] {
  return eventsStore
    .slice()
    .reverse()
    .slice(0, limit);
}

export function getSpamEventStats(): {
  total: number;
  byAction: Record<string, number>;
} {
  const byAction: Record<string, number> = {
    allow: 0,
    warn: 0,
    throttle: 0,
    block: 0,
  };

  for (const event of eventsStore) {
    byAction[event.action] = (byAction[event.action] ?? 0) + 1;
  }

  return {
    total: eventsStore.length,
    byAction,
  };
}

// ========== レートリミット ==========

/**
 * レートリミットをチェック
 */
export function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; count: number; resetAt: string } {
  const nowTime = Date.now();
  const counter = rateCountersStore.get(key);

  // カウンターが存在しない or リセット期限切れ → 新規作成
  if (!counter || new Date(counter.resetAt).getTime() <= nowTime) {
    const resetAt = new Date(nowTime + windowMs).toISOString();
    rateCountersStore.set(key, { key, count: 1, resetAt });
    return { allowed: true, count: 1, resetAt };
  }

  // カウンター加算
  counter.count++;

  // 上限チェック
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

export function seedSpamRulesIfEmpty(): void {
  if (rulesStore.size > 0) return;

  // デフォルトNGワード
  const defaultNgWords = [
    { pattern: '詐欺', severity: 'block' as SpamSeverity, description: '詐欺関連' },
    { pattern: '出会い系', severity: 'block' as SpamSeverity, description: '出会い系' },
    { pattern: 'http://', severity: 'warn' as SpamSeverity, description: 'URL含む（要確認）' },
    { pattern: 'https://', severity: 'warn' as SpamSeverity, description: 'URL含む（要確認）' },
  ];

  for (const ngWord of defaultNgWords) {
    createRule({
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
    createRule({
      type: 'regex',
      pattern: regex.pattern,
      enabled: true,
      severity: regex.severity,
      description: regex.description,
    });
  }
}
