/**
 * 入力サニタイズユーティリティ
 *
 * API ルートやフォーム入力のバリデーション・サニタイズを提供。
 * XSS, SQLi, コマンドインジェクション等の攻撃を防止する。
 */

/**
 * HTML特殊文字をエスケープ
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * 文字列入力をサニタイズ（トリム + 長さ制限）
 * null/undefined はそのまま返す
 */
export function sanitizeString(
  input: unknown,
  maxLength: number = 10000
): string | null {
  if (input == null) return null;
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * 数値入力をバリデーション
 * 範囲チェック付き
 */
export function sanitizeNumber(
  input: unknown,
  options?: { min?: number; max?: number; defaultValue?: number }
): number | null {
  if (input == null) return options?.defaultValue ?? null;

  const num = typeof input === 'number' ? input : Number(input);
  if (isNaN(num) || !isFinite(num)) return options?.defaultValue ?? null;

  if (options?.min != null && num < options.min) return options.defaultValue ?? null;
  if (options?.max != null && num > options.max) return options.defaultValue ?? null;

  return num;
}

/**
 * メールアドレスの基本バリデーション
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * IDフィールドのバリデーション（Firestore Document ID）
 * 英数字、ハイフン、アンダースコアのみ許可
 */
export function isValidDocumentId(id: string): boolean {
  if (!id || id.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * API リクエストボディの型チェック
 * 未知のフィールドを除去し、期待されるフィールドのみ返す
 */
export function pickFields<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
  allowedFields: string[]
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      result[field] = body[field];
    }
  }
  return result as Partial<T>;
}

/**
 * 日付文字列のバリデーション（YYYY-MM-DD形式）
 */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * URL のバリデーション
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
