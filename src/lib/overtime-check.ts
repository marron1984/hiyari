// ======== 勤怠・残業申請 突合ロジック ========
// 勤怠実績と残業申請を日付単位で突合し、差異を検出する

import {
  OvertimeCheck,
  OvertimeCheckStatus,
  STANDARD_WORK_MINUTES,
  OVERTIME_CHECK_THRESHOLDS,
  TimeEntry,
} from '@/types/attendance';
import { OvertimePayload, Application } from '@/types/application';
import { formatMinutesToHHMM } from './attendance-calc';

// 突合入力
export interface OvertimeCheckInput {
  userId: string;
  userName: string;
  employeeCode: string;
  branchId: string;
  tenantId: string;
  workDate: string; // YYYY-MM-DD

  // 勤怠実績
  timeEntry?: {
    id: string;
    totalWorkMinutes: number;
  };

  // 残業申請（複数ある場合は合算済み）
  overtimeApplication?: {
    id: string;
    requestedMinutes: number;
    status: string;
  };
}

// 突合結果（保存前）
export interface OvertimeCheckResult {
  status: OvertimeCheckStatus;
  actualOvertimeMinutes: number;
  requestedMinutes: number;
  diffMinutes: number;
  message: string;
}

/**
 * 残業時間を計算（実労働時間 - 所定労働時間）
 * 所定労働時間: 8時間 = 480分
 */
export function calculateActualOvertimeMinutes(totalWorkMinutes: number): number {
  return Math.max(0, totalWorkMinutes - STANDARD_WORK_MINUTES);
}

/**
 * 突合ステータスを判定
 *
 * OK: 実績と申請が±15分以内
 * WARN: 差が15〜60分
 * NG: 実績残業30分超で申請なし
 */
export function determineOvertimeCheckStatus(
  actualOvertimeMinutes: number,
  requestedMinutes: number
): OvertimeCheckResult {
  const diffMinutes = actualOvertimeMinutes - requestedMinutes;
  const absDiff = Math.abs(diffMinutes);

  // ケース1: 申請なしで実績残業30分超 → NG
  if (requestedMinutes === 0 && actualOvertimeMinutes > OVERTIME_CHECK_THRESHOLDS.NG_NO_REQUEST) {
    return {
      status: 'NG',
      actualOvertimeMinutes,
      requestedMinutes,
      diffMinutes,
      message: `残業申請がありません（実績: ${formatMinutesToHHMM(actualOvertimeMinutes)}）`,
    };
  }

  // ケース2: 差が15分以内 → OK
  if (absDiff <= OVERTIME_CHECK_THRESHOLDS.OK_DIFF) {
    return {
      status: 'OK',
      actualOvertimeMinutes,
      requestedMinutes,
      diffMinutes,
      message: '実績と申請が一致しています',
    };
  }

  // ケース3: 差が15〜60分 → WARN
  if (absDiff <= OVERTIME_CHECK_THRESHOLDS.WARN_DIFF) {
    const direction = diffMinutes > 0 ? '超過' : '不足';
    return {
      status: 'WARN',
      actualOvertimeMinutes,
      requestedMinutes,
      diffMinutes,
      message: `申請と実績に差異があります（${direction}: ${formatMinutesToHHMM(absDiff)}）`,
    };
  }

  // ケース4: 差が60分超 → NG
  const direction = diffMinutes > 0 ? '超過' : '不足';
  return {
    status: 'NG',
    actualOvertimeMinutes,
    requestedMinutes,
    diffMinutes,
    message: `申請と実績に大きな差異があります（${direction}: ${formatMinutesToHHMM(absDiff)}）`,
  };
}

/**
 * 1件の突合を実行
 */
export function executeOvertimeCheck(input: OvertimeCheckInput): Omit<OvertimeCheck, 'id' | 'createdAt'> {
  const actualWorkMinutes = input.timeEntry?.totalWorkMinutes ?? 0;
  const actualOvertimeMinutes = calculateActualOvertimeMinutes(actualWorkMinutes);
  const requestedMinutes = input.overtimeApplication?.requestedMinutes ?? 0;

  const result = determineOvertimeCheckStatus(actualOvertimeMinutes, requestedMinutes);

  return {
    tenantId: input.tenantId,
    branchId: input.branchId,
    userId: input.userId,
    userName: input.userName,
    employeeCode: input.employeeCode,
    workDate: input.workDate,

    // 勤怠実績
    timeEntryId: input.timeEntry?.id,
    actualWorkMinutes,
    actualOvertimeMinutes,

    // 残業申請
    applicationId: input.overtimeApplication?.id,
    requestedMinutes,
    applicationStatus: input.overtimeApplication?.status,

    // 突合結果
    status: result.status,
    diffMinutes: result.diffMinutes,
    message: result.message,

    // 通知（初期値）
    notified: false,

    // メタ
    checkedAt: new Date(),
  };
}

/**
 * 残業申請から申請時間（分）を計算
 */
export function calculateRequestedMinutesFromApplication(
  application: Application<OvertimePayload>
): number {
  const payload = application.payload;
  if (!payload?.startTime || !payload?.endTime) return 0;

  const [startH, startM] = payload.startTime.split(':').map(Number);
  const [endH, endM] = payload.endTime.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // 終了が開始より前なら日跨ぎ
  if (endMinutes <= startMinutes) {
    return (24 * 60 - startMinutes) + endMinutes;
  }

  return endMinutes - startMinutes;
}

/**
 * 通知が必要かどうかを判定
 */
export function shouldNotify(status: OvertimeCheckStatus): boolean {
  return status === 'NG' || status === 'WARN';
}

/**
 * 通知メッセージを生成
 */
export function generateNotificationMessage(
  check: Omit<OvertimeCheck, 'id' | 'createdAt'>,
  type: 'ng' | 'warn'
): { title: string; message: string } {
  const dateFormatted = check.workDate.replace(/-/g, '/');

  if (type === 'ng') {
    return {
      title: `【要対応】${dateFormatted} の残業申請`,
      message: check.message,
    };
  }

  return {
    title: `【確認】${dateFormatted} の残業申請`,
    message: check.message,
  };
}

/**
 * 残業申請画面へのURLを生成
 * 日付をプリフィルして新規作成画面へ遷移
 */
export function generateOvertimeApplicationUrl(workDate: string): string {
  return `/dashboard/attendance/overtime/new?date=${workDate}`;
}
