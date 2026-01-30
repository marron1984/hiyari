// src/lib/prospect.ts
import dayjs from "dayjs";

export const KPI_START_YEAR = 2026;

/**
 * 有効プロスペクトの開始日時
 * 2026-01-12 13:49 JST
 */
export const PROSPECTS_ACTIVE_FROM = dayjs(
  "2026-01-12T13:49:00+09:00"
);

/**
 * プロスペクトの基準日時を取得
 * 優先順位: inquiryDate > receivedAt > createdAt
 */
export function getProspectCutoffDate(prospect: any): dayjs.Dayjs {
  if (prospect.inquiryDate) {
    const d = dayjs(prospect.inquiryDate);
    if (d.isValid()) return d;
  }

  if (prospect.receivedAt) {
    const d = dayjs(prospect.receivedAt);
    if (d.isValid()) return d;
  }

  return dayjs(prospect.createdAt);
}

/**
 * 有効プロスペクト判定
 * 2026-01-12 13:49 以降のみ true
 */
export function isProspectValid(prospect: any): boolean {
  const date = getProspectCutoffDate(prospect);
  return date.isSameOrAfter(PROSPECTS_ACTIVE_FROM);
}