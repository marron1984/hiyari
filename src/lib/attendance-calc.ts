// ======== 勤怠計算ロジック ========
// すべてJST、日跨ぎ対応、1分単位丸め

import { TimeEntry, WorkShift } from '@/types/attendance';

// JST オフセット（+9時間）
const JST_OFFSET = 9 * 60 * 60 * 1000;

// 深夜時間帯（22:00-05:00）
const LATE_NIGHT_START_HOUR = 22;
const LATE_NIGHT_END_HOUR = 5;

/**
 * Date を JST の時刻文字列に変換 (HH:mm)
 */
export function formatTimeJST(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET);
  const hours = jst.getUTCHours().toString().padStart(2, '0');
  const minutes = jst.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Date を JST の日付文字列に変換 (YYYY-MM-DD)
 */
export function formatDateJST(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET);
  const year = jst.getUTCFullYear();
  const month = (jst.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = jst.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 現在のJST日付を取得
 */
export function getTodayJST(): string {
  return formatDateJST(new Date());
}

/**
 * 現在のJST時刻を取得
 */
export function getNowJST(): Date {
  return new Date();
}

/**
 * 日付文字列と時刻文字列からDateオブジェクトを作成（JST）
 */
export function parseJSTDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  // JSTとして解釈してUTCに変換
  const utc = Date.UTC(year, month - 1, day, hours - 9, minutes, 0, 0);
  return new Date(utc);
}

/**
 * 2つの時刻間の分数を計算
 */
export function calculateMinutesBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

/**
 * 実労働時間を計算（分単位）
 * = 退勤時刻 - 出勤時刻 - 休憩時間
 */
export function calculateTotalWorkMinutes(
  clockIn: Date,
  clockOut: Date,
  breakMinutes: number
): number {
  const totalMinutes = calculateMinutesBetween(clockIn, clockOut);
  const workMinutes = totalMinutes - breakMinutes;
  return Math.max(0, workMinutes);
}

/**
 * 深夜時間を計算（22:00-05:00の重複分）
 * 日跨ぎ対応
 */
export function calculateLateNightMinutes(clockIn: Date, clockOut: Date): number {
  let lateNightMinutes = 0;
  const current = new Date(clockIn.getTime());
  const endTime = clockOut.getTime();

  while (current.getTime() < endTime) {
    const jstHour = getJSTHour(current);

    // 22:00-24:00 または 00:00-05:00 が深夜時間
    const isLateNight = jstHour >= LATE_NIGHT_START_HOUR || jstHour < LATE_NIGHT_END_HOUR;

    if (isLateNight) {
      lateNightMinutes++;
    }

    // 1分進める
    current.setTime(current.getTime() + 60 * 1000);
  }

  return lateNightMinutes;
}

/**
 * DateからJSTの時間（0-23）を取得
 */
function getJSTHour(date: Date): number {
  const jst = new Date(date.getTime() + JST_OFFSET);
  return jst.getUTCHours();
}

/**
 * 残業候補時間を計算（シフトとの差分）
 * 注意: 実際の残業は承認後のみ確定
 */
export function calculateOvertimeCandidateMinutes(
  actualWorkMinutes: number,
  shift?: WorkShift
): number {
  if (!shift) return 0;

  // シフトの所定労働時間を計算
  const plannedStart = parseJSTDateTime(shift.workDate, shift.plannedStart);
  const plannedEnd = parseJSTDateTime(shift.workDate, shift.plannedEnd);

  // 日跨ぎ対応（終了時刻が開始時刻より前なら翌日扱い）
  let plannedEndTime = plannedEnd.getTime();
  if (plannedEndTime <= plannedStart.getTime()) {
    plannedEndTime += 24 * 60 * 60 * 1000; // 24時間追加
  }

  const plannedWorkMinutes = Math.floor(
    (plannedEndTime - plannedStart.getTime()) / (1000 * 60)
  ) - shift.breakMinutes;

  const overtimeCandidate = actualWorkMinutes - plannedWorkMinutes;
  return Math.max(0, overtimeCandidate);
}

/**
 * TimeEntryから勤怠サマリーを計算
 */
export function calculateTimeEntrySummary(
  entry: TimeEntry,
  shift?: WorkShift
): {
  totalWorkMinutes: number;
  lateNightMinutes: number;
  overtimeCandidateMinutes: number;
  breakMinutes: number;
} {
  if (!entry.clockIn || !entry.clockOut) {
    return {
      totalWorkMinutes: 0,
      lateNightMinutes: 0,
      overtimeCandidateMinutes: 0,
      breakMinutes: entry.actualBreakMinutes || 0,
    };
  }

  const breakMinutes = entry.actualBreakMinutes || 0;
  const totalWorkMinutes = calculateTotalWorkMinutes(
    entry.clockIn,
    entry.clockOut,
    breakMinutes
  );
  const lateNightMinutes = calculateLateNightMinutes(entry.clockIn, entry.clockOut);
  const overtimeCandidateMinutes = calculateOvertimeCandidateMinutes(totalWorkMinutes, shift);

  return {
    totalWorkMinutes,
    lateNightMinutes,
    overtimeCandidateMinutes,
    breakMinutes,
  };
}

/**
 * 分を時間:分形式に変換
 */
export function formatMinutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
}

/**
 * 分を時間（小数点以下2桁）に変換
 */
export function formatMinutesToDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

/**
 * 日跨ぎ判定
 * clockInとclockOutが異なる日付の場合true
 */
export function isOvernightShift(clockIn: Date, clockOut: Date): boolean {
  const inDate = formatDateJST(clockIn);
  const outDate = formatDateJST(clockOut);
  return inDate !== outDate;
}

/**
 * 遅刻判定
 */
export function isLate(clockIn: Date, shift?: WorkShift): boolean {
  if (!shift) return false;
  const plannedStart = parseJSTDateTime(shift.workDate, shift.plannedStart);
  return clockIn.getTime() > plannedStart.getTime();
}

/**
 * 早退判定
 */
export function isEarlyLeave(clockOut: Date, shift?: WorkShift): boolean {
  if (!shift) return false;
  let plannedEnd = parseJSTDateTime(shift.workDate, shift.plannedEnd);

  // 日跨ぎ対応
  const plannedStart = parseJSTDateTime(shift.workDate, shift.plannedStart);
  if (plannedEnd.getTime() <= plannedStart.getTime()) {
    plannedEnd = new Date(plannedEnd.getTime() + 24 * 60 * 60 * 1000);
  }

  return clockOut.getTime() < plannedEnd.getTime();
}

/**
 * 勤務日を判定（clockIn基準）
 */
export function getWorkDateFromClockIn(clockIn: Date): string {
  return formatDateJST(clockIn);
}
