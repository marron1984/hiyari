/**
 * 日本時間の月キーを取得 (yyyyMM)
 */
export function getMonthKey(date: Date = new Date()): string {
  // 日本時間に変換
  const jstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const year = jstDate.getFullYear();
  const month = String(jstDate.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * 月キーから年と月を取得
 */
export function parseMonthKey(monthKey: string): { year: number; month: number } {
  return {
    year: parseInt(monthKey.substring(0, 4), 10),
    month: parseInt(monthKey.substring(4, 6), 10),
  };
}

/**
 * 月キーの表示用文字列を取得
 */
export function formatMonthKey(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  return `${year}年${month}月`;
}

/**
 * 今日の日付をYYYY-MM-DD形式で取得（日本時間）
 */
export function getTodayString(): string {
  const now = new Date();
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const year = jst.getFullYear();
  const month = String(jst.getMonth() + 1).padStart(2, '0');
  const day = String(jst.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 日本語の日付表示
 */
export function formatDateJP(dateString: string): string {
  const [year, month, day] = dateString.split('-');
  return `${year}年${parseInt(month)}月${parseInt(day)}日`;
}

/**
 * 過去N ヶ月のmonthKeyリストを取得
 */
export function getPastMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

  for (let i = 0; i < count; i++) {
    const d = new Date(jst.getFullYear(), jst.getMonth() - i, 1);
    keys.push(getMonthKey(d));
  }

  return keys;
}

/**
 * 曜日名を取得
 */
export function getDayOfWeekName(date: Date): string {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[date.getDay()];
}

/**
 * 曜日インデックスを取得（日曜=0）
 */
export function getDayOfWeek(dateString: string): number {
  return new Date(dateString).getDay();
}

/**
 * 時間帯のインデックスを取得
 */
export function getTimeSlotIndex(timeSlot: string): number {
  const slots = ['早朝', '日中', '夕方', '夜勤'];
  return slots.indexOf(timeSlot);
}

/**
 * CSVエスケープ
 */
export function escapeCSV(value: string | number | boolean | undefined | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * CSV生成
 */
export function generateCSV(headers: string[], rows: (string | number | boolean | undefined | null)[][]): string {
  const BOM = '\uFEFF';
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map((row) => row.map(escapeCSV).join(','));
  return BOM + [headerLine, ...dataLines].join('\n');
}

/**
 * ファイルダウンロード
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * クラス名を結合
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
