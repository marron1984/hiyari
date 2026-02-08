/**
 * スプレッドシート行の正規化
 *
 * 列定義（0-indexed）:
 *   B(1): 建物名 → facilityName
 *   C(2): 部屋番号 → roomNo
 *   D(3): 部屋ステータス → status
 *   E(4): 入居者様氏名 → residentName
 *   F(5): しめい → residentKana
 *   G(6): 入居（予定）日 → moveInDate
 *   H(7): 備考 → notes
 *   I(8): 介護度（入居想定） → careLevel
 */

export type SheetVacancyStatus = 'occupied' | 'reserved' | 'available' | 'other';

export interface NormalizedRow {
  facilityName: string;
  roomNo: string;
  status: SheetVacancyStatus;
  rawStatus: string;
  residentName: string;
  residentKana: string;
  moveInDate: string | null;
  notes: string;
  careLevel: string;
  rowNumber: number;
}

const STATUS_MAP: Record<string, SheetVacancyStatus> = {
  '1.入居中': 'occupied',
  '2.入居予定': 'reserved',
  '3.予約済': 'reserved',
  '5.空室': 'available',
};

function normalizeStatus(raw: string): SheetVacancyStatus {
  const trimmed = raw.trim();
  return STATUS_MAP[trimmed] ?? 'other';
}

/**
 * 日付文字列を ISO 形式に正規化（YYYY-MM-DD）
 * 対応: "2026/01/15", "2026-01-15", "R8.1.15" 等
 */
function normalizeDate(raw: string): string | null {
  if (!raw) return null;

  // YYYY/MM/DD or YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

function col(values: string[], index: number): string {
  return (values[index] ?? '').trim();
}

/**
 * 1行を正規化。roomNo が空の行は null を返す（スキップ対象）
 */
export function normalizeRow(
  values: string[],
  rowNumber: number,
): NormalizedRow | null {
  const roomNo = col(values, 2); // C列
  if (!roomNo) return null;

  const rawStatus = col(values, 3);

  return {
    facilityName: col(values, 1), // B列
    roomNo,
    status: normalizeStatus(rawStatus),
    rawStatus,
    residentName: col(values, 4), // E列
    residentKana: col(values, 5), // F列
    moveInDate: normalizeDate(col(values, 6)), // G列
    notes: col(values, 7), // H列
    careLevel: col(values, 8), // I列
    rowNumber,
  };
}
