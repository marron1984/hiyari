/**
 * 連絡先の正規化とハッシュ生成
 *
 * Ticket 079: 空室問い合わせの重複統合
 *
 * - PIIをそのまま保存しない（ハッシュ化）
 * - 同一連絡先の判定に使用
 */

import { createHash } from 'crypto';

/**
 * メールアドレスを正規化
 * - lowercase
 * - trim
 * - Gmail の +alias や . を除去（オプション）
 */
export function normalizeEmail(email: string): string {
  let normalized = email.toLowerCase().trim();

  // Gmail の場合、+以降とドットを除去（より厳密なマッチング）
  if (normalized.includes('@gmail.com') || normalized.includes('@googlemail.com')) {
    const [localPart, domain] = normalized.split('@');
    const cleanLocal = localPart.split('+')[0].replace(/\./g, '');
    normalized = `${cleanLocal}@${domain}`;
  }

  return normalized;
}

/**
 * 電話番号を正規化
 * - 数字のみ抽出
 * - 国番号の統一（81 → 0、先頭0はそのまま）
 */
export function normalizePhone(phone: string): string {
  // 数字のみ抽出
  let digits = phone.replace(/\D/g, '');

  // 国番号 81 で始まる場合、0 に置換
  if (digits.startsWith('81') && digits.length > 10) {
    digits = '0' + digits.slice(2);
  }

  // +81 のパターン（既に数字のみなので81始まりで処理済み）

  return digits;
}

/**
 * 連絡先からハッシュキーを生成
 *
 * @param email - メールアドレス（任意）
 * @param phone - 電話番号（任意）
 * @returns SHA256ハッシュ（先頭16文字）
 */
export function generateContactHash(
  email?: string | null,
  phone?: string | null
): string | null {
  const parts: string[] = [];

  if (email) {
    parts.push(`email:${normalizeEmail(email)}`);
  }

  if (phone) {
    parts.push(`phone:${normalizePhone(phone)}`);
  }

  if (parts.length === 0) {
    return null;
  }

  // ソートして順序を一定に
  parts.sort();

  const combined = parts.join('|');
  const hash = createHash('sha256').update(combined).digest('hex');

  // 先頭16文字で十分な一意性
  return hash.slice(0, 16);
}

/**
 * 2つの連絡先が同一かどうかを判定
 *
 * @param a - 連絡先A
 * @param b - 連絡先B
 * @returns 同一ならtrue
 */
export function isSameContact(
  a: { email?: string | null; phone?: string | null },
  b: { email?: string | null; phone?: string | null }
): boolean {
  const hashA = generateContactHash(a.email, a.phone);
  const hashB = generateContactHash(b.email, b.phone);

  if (!hashA || !hashB) {
    return false;
  }

  return hashA === hashB;
}

/**
 * 重複検索用の期間（日数）
 */
export const DUPLICATE_CHECK_DAYS = 14;

/**
 * 重複チェック対象のチケットステータス
 */
export const DUPLICATE_CHECK_STATUSES = ['open', 'in_progress', 'waiting'] as const;
