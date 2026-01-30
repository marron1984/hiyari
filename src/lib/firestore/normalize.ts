/**
 * Firestore undefined 完全排除ユーティリティ
 *
 * Firestore は undefined を保存できないため、
 * すべてのペイロードは保存前にこの関数を通す必要がある。
 */

/**
 * オブジェクトから undefined を除去し、空文字列に置換
 * - undefined → ''
 * - null はそのまま（Firestoreは null を許容）
 * - 配列内の undefined も除去
 * - ネストしたオブジェクトも再帰的に処理
 */
export function normalizePayload<T extends Record<string, unknown>>(obj: T): T {
  if (obj === null || obj === undefined) {
    return {} as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      // undefined は空文字列に変換
      result[key] = '';
    } else if (Array.isArray(value)) {
      // 配列の場合は undefined を除去し、各要素を正規化
      result[key] = value
        .filter((item) => item !== undefined)
        .map((item) =>
          typeof item === 'object' && item !== null
            ? normalizePayload(item as Record<string, unknown>)
            : item
        );
    } else if (typeof value === 'object' && value !== null) {
      // ネストしたオブジェクトは再帰的に処理
      result[key] = normalizePayload(value as Record<string, unknown>);
    } else {
      // その他の値はそのまま
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Firestore ドキュメント用に正規化
 * - undefined を除去
 * - Date オブジェクトはそのまま（Firestore が Timestamp に変換）
 * - 空文字列は保持（削除しない）
 */
export function normalizeForFirestore<T extends Record<string, unknown>>(
  data: T,
  options?: {
    removeEmptyStrings?: boolean;
    removeNulls?: boolean;
  }
): T {
  const { removeEmptyStrings = false, removeNulls = false } = options || {};

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // undefined は常にスキップ
    if (value === undefined) {
      continue;
    }

    // null のハンドリング
    if (value === null) {
      if (!removeNulls) {
        result[key] = null;
      }
      continue;
    }

    // 空文字列のハンドリング
    if (value === '' && removeEmptyStrings) {
      continue;
    }

    // 配列のハンドリング
    if (Array.isArray(value)) {
      const normalizedArray = value
        .filter((item) => item !== undefined)
        .map((item) =>
          typeof item === 'object' && item !== null && !(item instanceof Date)
            ? normalizeForFirestore(item as Record<string, unknown>, options)
            : item
        );
      result[key] = normalizedArray;
      continue;
    }

    // Date オブジェクトはそのまま
    if (value instanceof Date) {
      result[key] = value;
      continue;
    }

    // ネストしたオブジェクトは再帰的に処理
    if (typeof value === 'object') {
      result[key] = normalizeForFirestore(value as Record<string, unknown>, options);
      continue;
    }

    // その他の値はそのまま
    result[key] = value;
  }

  return result as T;
}

/**
 * 申請ペイロード専用の正規化
 * - 必須フィールドが undefined の場合はデフォルト値を設定
 * - オプションフィールドの undefined は空文字列に変換
 */
export function normalizeApplicationPayload<T extends Record<string, unknown>>(
  payload: T,
  defaults?: Partial<T>
): T {
  // まずデフォルト値をマージ
  const merged = { ...defaults, ...payload };

  // 次に正規化
  return normalizePayload(merged);
}

/**
 * 経費申請ペイロードの正規化
 */
export interface ExpensePayloadInput {
  expenseDate?: string;
  amount?: number;
  category?: string;
  paymentMethod?: string;
  vendor?: string;
  description?: string;
  receiptUrls?: string[];
  taxAmount?: number;
  purpose?: string;
  participants?: string[];
  projectCode?: string;
}

export function normalizeExpensePayload(input: ExpensePayloadInput) {
  return normalizeForFirestore({
    expenseDate: input.expenseDate || '',
    amount: input.amount || 0,
    category: input.category || '交通費',
    paymentMethod: input.paymentMethod || '立替',
    vendor: input.vendor || '',
    description: input.description || '',
    receiptUrls: input.receiptUrls || [],
    taxAmount: input.taxAmount,
    purpose: input.purpose || '',
    participants: input.participants || [],
    projectCode: input.projectCode || '',
  }, { removeNulls: true });
}

/**
 * 残業申請ペイロードの正規化
 */
export interface OvertimePayloadInput {
  date?: string;
  startTime?: string;
  endTime?: string;
  hours?: number;
  reason?: string;
  reasonDetail?: string;
  workContent?: string;
  isHoliday?: boolean;
  isNightShift?: boolean;
}

export function normalizeOvertimePayload(input: OvertimePayloadInput) {
  return normalizeForFirestore({
    date: input.date || '',
    startTime: input.startTime || '',
    endTime: input.endTime || '',
    hours: input.hours || 0,
    reason: input.reason || '業務繁忙',
    reasonDetail: input.reasonDetail || '',
    workContent: input.workContent || '',
    isHoliday: input.isHoliday || false,
    isNightShift: input.isNightShift || false,
  });
}
