/**
 * 迷惑フィルタ 型定義
 *
 * Ticket 077: 迷惑フィルタ（NGワード/連投/ブラックリスト）
 *
 * vacancy inquiry を守るための軽量スパム対策
 */

// ========== ルールタイプ ==========

export type SpamRuleType = 'ng_word' | 'regex' | 'rate_limit' | 'blocklist';

export type SpamSeverity = 'warn' | 'block';

export type SpamAction = 'allow' | 'warn' | 'throttle' | 'block';

// ========== ルール ==========

/**
 * スパムルール
 */
export interface SpamRule {
  id: string;
  type: SpamRuleType;
  pattern: string;
  enabled: boolean;
  severity: SpamSeverity;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// ========== ブロックリスト ==========

export type BlocklistKind = 'ip' | 'email' | 'phone' | 'ref' | 'userAgentHash';

/**
 * ブロックリストエントリ
 */
export interface BlocklistEntry {
  id: string;
  kind: BlocklistKind;
  valueHash: string;
  reason: string;
  expiresAt: string | null; // nullなら永久
  createdAt: string;
  createdByUserId: string;
}

// ========== イベント ==========

/**
 * スパムイベント（ログ）
 */
export interface SpamEvent {
  id: string;
  occurredAt: string;
  action: SpamAction;
  reason: string;
  ipHint: string | null;
  userAgentHash: string | null;
  emailHash: string | null;
  phoneHash: string | null;
  payloadHint: string | null;
  path: string;
  ruleId: string | null;
}

// ========== レートカウンター ==========

/**
 * レートリミットカウンター
 */
export interface RateCounter {
  key: string;
  count: number;
  resetAt: string;
}

// ========== チェック結果 ==========

/**
 * スパムチェック結果
 */
export interface SpamCheckResult {
  ok: boolean;
  action: SpamAction;
  reason: string | null;
  ruleId: string | null;
}

// ========== チェックコンテキスト ==========

/**
 * スパムチェック用コンテキスト
 */
export interface SpamCheckContext {
  ip?: string;
  userAgent?: string;
  path: string;
}

/**
 * チェック対象ペイロード
 */
export interface SpamCheckPayload {
  name?: string;
  email?: string;
  phone?: string;
  memo?: string;
  conditions?: string;
  ref?: string;
}

// ========== 設定 ==========

/** NGワード検出時のデフォルト動作 */
export const DEFAULT_NG_WORD_SEVERITY: SpamSeverity = 'warn';

/** 同一IPのレートリミット（5分で3回） */
export const IP_RATE_LIMIT = {
  windowMs: 5 * 60 * 1000, // 5分
  maxRequests: 3,
};

/** 同一メールのレートリミット（10分で2回） */
export const EMAIL_RATE_LIMIT = {
  windowMs: 10 * 60 * 1000, // 10分
  maxRequests: 2,
};

/** 同一電話番号のレートリミット（10分で2回） */
export const PHONE_RATE_LIMIT = {
  windowMs: 10 * 60 * 1000, // 10分
  maxRequests: 2,
};

// ========== RBAC ==========

export function canManageSpamRules(viewer: { role: string }): boolean {
  return ['admin', 'manager'].includes(viewer.role);
}

export function canViewSpamEvents(viewer: { role: string }): boolean {
  return ['admin', 'manager'].includes(viewer.role);
}
