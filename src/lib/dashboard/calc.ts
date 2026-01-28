// ======== ダッシュボード数値計算ユーティリティ ========
// ゼロ割や無効データ時の表示を統一

/**
 * 安全な率計算
 * 分母が0の場合はnullを返す
 */
export function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0 || !Number.isFinite(denominator)) {
    return null;
  }
  const rate = (numerator / denominator) * 100;
  return Math.round(rate);
}

/**
 * パーセント表示用フォーマット
 * null/undefinedの場合は"--"を返す
 */
export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return '--';
  }
  return `${rate}%`;
}

/**
 * 分数表示用フォーマット（例: 3/5）
 * 分母が0の場合は"--"を返す
 */
export function formatFraction(numerator: number, denominator: number): string {
  if (denominator === 0 || !Number.isFinite(denominator)) {
    return '--';
  }
  return `${numerator}/${denominator}`;
}

/**
 * 数値表示用フォーマット
 * null/undefinedの場合は"--"を返す
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return value.toString();
}

/**
 * 稼働率計算（入居数/定員）
 * 定員が0の場合はnullを返す
 */
export function calcOccupancyRate(
  totalCapacity: number,
  vacantCount: number
): number | null {
  if (totalCapacity === 0) {
    return null;
  }
  const occupied = totalCapacity - vacantCount;
  return Math.round((occupied / totalCapacity) * 100);
}

/**
 * CV率計算（成約数/総案件数）
 * 総案件数が0の場合はnullを返す
 */
export function calcCvRate(
  completedCount: number,
  totalCount: number
): number | null {
  return safeRate(completedCount, totalCount);
}

/**
 * 介入実施率計算（完了数/総介入数）
 * 総介入数が0の場合はnullを返す（100%ではない）
 */
export function calcInterventionRate(
  doneCount: number,
  totalCount: number
): number | null {
  return safeRate(doneCount, totalCount);
}

// ======== ダッシュボードエラー型 ========

export interface DashboardError {
  code: string;
  message: string;
  createIndexUrl?: string;
}

/**
 * FirebaseErrorからインデックス作成URLを抽出
 */
export function extractIndexUrl(error: unknown): string | undefined {
  if (error instanceof Error) {
    const message = error.message;
    const urlMatch = message.match(/(https:\/\/console\.firebase\.google\.com\/[^\s]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
  }
  return undefined;
}

/**
 * エラーをDashboardError形式に変換
 */
export function toDashboardError(error: unknown): DashboardError {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const createIndexUrl = extractIndexUrl(error);

  // FirebaseError判定
  if (message.includes('requires an index')) {
    return {
      code: 'INDEX_REQUIRED',
      message: 'Firestoreのインデックスが必要です',
      createIndexUrl,
    };
  }

  if (message.includes('permission-denied')) {
    return {
      code: 'PERMISSION_DENIED',
      message: 'アクセス権限がありません',
    };
  }

  return {
    code: 'UNKNOWN',
    message,
  };
}
