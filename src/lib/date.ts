// ======== 日付変換ユーティリティ ========
// Firestore Timestamp / string / Date を安全に変換

import { format, parseISO, isValid } from 'date-fns';
import { ja } from 'date-fns/locale';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/ja';

// dayjs を日本語に設定
dayjs.locale('ja');

/**
 * Firestore Timestamp / string / Date を Date に変換
 * - Firestore Timestamp: .toDate() で変換
 * - string: parseISO で変換
 * - Date: そのまま返す
 * - null/undefined: null を返す
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;

  // Firestore Timestamp（toDate メソッドがある）
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }

  // Date オブジェクト
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  // ISO文字列
  if (typeof value === 'string') {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
  }

  // 数値（Unix timestamp）
  if (typeof value === 'number') {
    const date = new Date(value);
    return isValid(date) ? date : null;
  }

  return null;
}

/**
 * 日付を指定フォーマットで文字列に変換
 * - value が null/undefined なら fallback を返す
 */
export function formatDate(
  value: unknown,
  formatStr: string = 'yyyy/MM/dd HH:mm',
  fallback: string = '-'
): string {
  const date = toDate(value);
  if (!date) return fallback;

  try {
    return format(date, formatStr, { locale: ja });
  } catch {
    return fallback;
  }
}

/**
 * 短い日付フォーマット（yyyy/MM/dd）
 */
export function formatDateShort(value: unknown, fallback: string = '-'): string {
  return formatDate(value, 'yyyy/MM/dd', fallback);
}

/**
 * 日時フォーマット（yyyy/MM/dd HH:mm）
 */
export function formatDateTime(value: unknown, fallback: string = '-'): string {
  return formatDate(value, 'yyyy/MM/dd HH:mm', fallback);
}

/**
 * 相対日時（○日前、○時間前など）
 */
export function formatRelative(value: unknown, fallback: string = '-'): string {
  const date = toDate(value);
  if (!date) return fallback;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 7) return `${diffDay}日前`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}週間前`;

  return formatDate(value, 'yyyy/MM/dd');
}

/**
 * ISO文字列に変換
 */
export function toISOString(value: unknown): string | null {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

/**
 * Firestore Timestamp / string / Date を dayjs に変換
 * - Firestore Timestamp / Date / string / number を自動判定
 * - 無効な値なら null を返す
 *
 * 使い方:
 *   toDayjs(createdAt)?.format("YYYY/MM/DD HH:mm") ?? "-"
 */
export function toDayjs(value: unknown): Dayjs | null {
  if (!value) return null;

  // Firestore Timestamp（toDate メソッドがある）
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return dayjs(date);
  }

  // Date オブジェクト
  if (value instanceof Date) {
    const d = dayjs(value);
    return d.isValid() ? d : null;
  }

  // ISO文字列 or 数値
  if (typeof value === 'string' || typeof value === 'number') {
    const d = dayjs(value);
    return d.isValid() ? d : null;
  }

  return null;
}
