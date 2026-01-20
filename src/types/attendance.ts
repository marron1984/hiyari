// ======== 勤怠管理モジュール 型定義 ========

// シフト種別
export type ShiftType =
  | '日勤'
  | '早番'
  | '遅番'
  | '夜勤'
  | '明け'
  | '休日'
  | '有給'
  | '公休'
  | 'その他';

export const SHIFT_TYPES: ShiftType[] = [
  '日勤',
  '早番',
  '遅番',
  '夜勤',
  '明け',
  '休日',
  '有給',
  '公休',
  'その他',
];

// 打刻状態
export type ClockStatus =
  | 'not_started'    // 未出勤
  | 'working'        // 勤務中
  | 'on_break'       // 休憩中
  | 'completed'      // 退勤済
  | 'missing_out';   // 退勤漏れ

// 勤怠データソース（将来AI連携用）
export type AttendanceSource = 'manual' | 'excel' | 'ai';

// 残業申請状態
export type OvertimeStatus = 'pending' | 'approved' | 'rejected';

// ======== シフト ========
export interface WorkShift {
  id: string;
  tenantId: string;
  branchId: string;
  userId: string;
  employeeCode: string;     // freee従業員コード
  workDate: string;         // YYYY-MM-DD
  plannedStart: string;     // HH:mm
  plannedEnd: string;       // HH:mm
  breakMinutes: number;     // 予定休憩時間（分）
  shiftType: ShiftType;
  source: AttendanceSource;
  // 将来AI連携用フィールド
  aiGenerationMeta?: {
    modelVersion?: string;
    generatedAt?: Date;
    prompt?: string;
  };
  confidenceScore?: number; // AI生成の信頼度 0-1
  createdAt: Date;
  updatedAt?: Date;
}

// ======== 打刻記録 ========
export interface TimeEntry {
  id: string;
  tenantId: string;
  branchId: string;
  userId: string;
  employeeCode: string;
  workDate: string;             // YYYY-MM-DD（clockIn基準）
  clockIn?: Date;               // 出勤時刻
  clockOut?: Date;              // 退勤時刻
  breakStart?: Date;            // 休憩開始
  breakEnd?: Date;              // 休憩終了
  actualBreakMinutes?: number;  // 実休憩時間（分）
  // 計算結果
  totalWorkMinutes?: number;    // 実労働時間（分）
  overtimeMinutes?: number;     // 残業時間（分）- 承認後のみ
  lateNightMinutes?: number;    // 深夜時間（分）22:00-05:00
  status: ClockStatus;
  // 編集追跡
  isEdited: boolean;
  editedBy?: string;
  editedAt?: Date;
  editReason?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// ======== 残業申請 ========
export interface OvertimeRequest {
  id: string;
  tenantId: string;
  branchId: string;
  userId: string;
  userName: string;
  employeeCode: string;
  workDate: string;           // YYYY-MM-DD
  requestedMinutes: number;   // 申請残業時間（分）
  reason: string;             // 申請理由
  status: OvertimeStatus;
  approvedBy?: string;        // 承認者ID
  approvedByName?: string;    // 承認者名
  approvedAt?: Date;
  rejectionReason?: string;   // 却下理由
  createdAt: Date;
  updatedAt?: Date;
}

// ======== 監査ログ ========
export type AuditTargetType = 'time_entry' | 'work_shift' | 'overtime_request';

export interface AttendanceAuditLog {
  id: string;
  tenantId: string;
  targetType: AuditTargetType;
  targetId: string;
  action: 'create' | 'update' | 'delete';
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  editedBy: string;
  editedByName: string;
  reason?: string;
  createdAt: Date;
}

// ======== 給与エクスポート ========
export interface PayrollExport {
  id: string;
  tenantId: string;
  branchId?: string;          // null = 全事業所
  periodStart: string;        // YYYY-MM-DD
  periodEnd: string;          // YYYY-MM-DD
  exportedBy: string;
  exportedByName: string;
  fileName: string;
  recordCount: number;
  createdAt: Date;
}

// ======== freee CSV出力用 ========
export interface FreeeAttendanceRow {
  employeeCode: string;       // 従業員コード
  workDate: string;           // 勤務日 YYYY-MM-DD
  workMinutes: number;        // 実労働時間（分）
  overtimeMinutes: number;    // 残業時間（分）承認済みのみ
  lateNightMinutes: number;   // 深夜時間（分）
  breakMinutes: number;       // 休憩時間（分）
}

// ======== UI用の今日の勤怠状態 ========
export interface TodayAttendanceState {
  status: ClockStatus;
  clockIn?: Date;
  clockOut?: Date;
  breakStart?: Date;
  breakEnd?: Date;
  totalWorkMinutes?: number;
  shift?: WorkShift;
}

// ======== 月次サマリー ========
export interface MonthlyAttendanceSummary {
  userId: string;
  userName: string;
  employeeCode: string;
  branchId: string;
  branchName: string;
  totalWorkDays: number;      // 出勤日数
  totalWorkMinutes: number;   // 総労働時間
  totalOvertimeMinutes: number; // 総残業時間（承認済み）
  totalLateNightMinutes: number; // 総深夜時間
  totalBreakMinutes: number;  // 総休憩時間
  missingClockOutCount: number; // 退勤漏れ件数
  lateCount: number;          // 遅刻件数
  earlyLeaveCount: number;    // 早退件数
}

// ======== フォーム入力値 ========
export interface ClockActionPayload {
  action: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  timestamp?: Date;           // 管理者による手動設定用
  editReason?: string;        // 編集理由
}

export interface ShiftImportRow {
  employeeCode: string;
  workDate: string;
  plannedStart: string;
  plannedEnd: string;
  breakMinutes: number;
  shiftType: ShiftType;
}

export interface ShiftImportResult {
  success: boolean;
  totalRows: number;
  importedRows: number;
  errors: { row: number; message: string }[];
}
