// ======== 人事連携（入社・退社）型定義 ========

// ======== インポートソース ========
export type HRImportSource = 'csv' | 'sheets' | 'freee';

// ======== 従業員ステータス ========
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

// ======== 雇用形態 ========
export type EmploymentType = '役員' | '正社員' | '契約社員' | 'パート' | '派遣' | 'インターン';

// ======== 従業員データ（AA-HUBマスタ） ========
export interface Employee {
  id: string;                     // AA-HUB内部ID
  tenantId: string;
  employeeCode: string;           // 従業員コード（freeeのemployee_codeと対応）

  // 基本情報
  name: string;
  nameKana?: string;
  email?: string;
  phoneNumber?: string;

  // 所属
  divisionId?: string;            // 事業部ID
  branchId?: string;              // 拠点ID
  departmentName?: string;        // 部門名（自由入力）
  position?: string;              // 役職

  // 雇用情報
  employmentType: EmploymentType;
  joinDate?: string;              // 入社日（YYYY-MM-DD）
  leaveDate?: string;             // 退社日（YYYY-MM-DD）
  status: EmployeeStatus;

  // 勤怠・承認・支払い対象フラグ
  isAttendanceTarget: boolean;    // 勤怠対象
  isApprovalTarget: boolean;      // 承認フロー対象
  isPaymentTarget: boolean;       // 支払い対象

  // 連携情報
  freeeEmployeeId?: number;       // freee従業員ID
  freeeCompanyId?: number;        // freee事業所ID
  lastSyncSource?: HRImportSource;
  lastSyncAt?: Date;

  // ユーザーアカウント連携
  userId?: string;                // usersコレクションのID

  // メタ
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ======== freee従業員データ（API取得用） ========
export interface FreeeEmployee {
  id: number;                     // freee従業員ID
  companyId: number;              // freee事業所ID
  employeeNumber?: string;        // 従業員番号
  displayName: string;            // 表示名
  lastName?: string;
  firstName?: string;
  lastNameKana?: string;
  firstNameKana?: string;
  email?: string;
  birthDate?: string;             // YYYY-MM-DD
  entryDate?: string;             // 入社日 YYYY-MM-DD
  retireDate?: string;            // 退社日 YYYY-MM-DD
  status?: 'working' | 'retired'; // freeeの在籍ステータス
  departmentName?: string;
  position?: string;
  employmentType?: string;
}

// ======== インポート行データ ========
export interface HRImportRow {
  // 識別
  employeeCode: string;           // 必須

  // 基本情報
  name: string;                   // 必須
  nameKana?: string;
  email?: string;
  phoneNumber?: string;

  // 所属
  divisionId?: string;
  branchId?: string;
  departmentName?: string;
  position?: string;

  // 雇用情報
  employmentType?: string;
  joinDate?: string;              // YYYY-MM-DD
  leaveDate?: string;             // YYYY-MM-DD

  // freee連携
  freeeEmployeeId?: number;

  // ノート
  notes?: string;
}

// ======== インポート結果 ========
export interface HRImportResult {
  success: boolean;
  source: HRImportSource;

  // 処理件数
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;

  // 入社・退社イベント
  hireEvents: HREvent[];
  leaveEvents: HREvent[];

  // エラー詳細
  errors: Array<{
    row: number;
    employeeCode?: string;
    message: string;
  }>;

  // 処理日時
  importedAt: Date;
  importedBy?: string;
  importedByName?: string;
}

// ======== 入社・退社イベント ========
export interface HREvent {
  type: 'hire' | 'leave';
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  eventDate: string;              // YYYY-MM-DD
  previousStatus?: EmployeeStatus;
  newStatus: EmployeeStatus;

  // 連動処理結果
  linkedActions: Array<{
    action: string;
    success: boolean;
    error?: string;
  }>;
}

// ======== 監査ログ ========
export interface HRImportAuditLog {
  id: string;
  tenantId: string;
  source: HRImportSource;

  // 結果サマリ
  result: HRImportResult;

  // 実行者
  executedBy?: string;
  executedByName?: string;

  // タイムスタンプ
  createdAt: Date;
}

// ======== dry_run差分プレビュー ========
export interface HRImportDiff {
  employeeCode: string;
  name: string;
  action: 'create' | 'update' | 'skip';

  // 変更内容（updateの場合）
  changes?: Array<{
    field: string;
    fieldLabel: string;
    before: string | number | boolean | null;
    after: string | number | boolean | null;
  }>;

  // ステータス変更
  statusChange?: {
    before: EmployeeStatus | null;
    after: EmployeeStatus;
    eventType?: 'hire' | 'leave' | 'rehire';
  };

  // フラグ変更
  flagChanges?: {
    isAttendanceTarget?: { before: boolean; after: boolean };
    isApprovalTarget?: { before: boolean; after: boolean };
    isPaymentTarget?: { before: boolean; after: boolean };
  };
}

// ======== dry_run結果 ========
export interface HRImportDryRunResult {
  success: boolean;
  source: HRImportSource;
  isDryRun: true;

  // 差分プレビュー
  diffs: HRImportDiff[];

  // 件数サマリ
  summary: {
    total: number;
    toCreate: number;
    toUpdate: number;
    toSkip: number;
    hireCount: number;
    leaveCount: number;
  };

  // 処理日時
  previewedAt: Date;
}

// ======== インポート実行ログ ========
export interface HRImportRun {
  id: string;
  tenantId: string;
  source: HRImportSource;

  // 実行モード
  mode: 'dry_run' | 'execute';

  // 結果
  result: HRImportResult | HRImportDryRunResult;

  // 実行者
  executedBy?: string;
  executedByName?: string;

  // 環境
  environment: 'production' | 'preview' | 'development';

  // タイムスタンプ
  startedAt: Date;
  completedAt: Date;
}

// ======== 定数 ========
export const EMPLOYEES_COLLECTION = 'employees';
export const HR_IMPORT_AUDIT_COLLECTION = 'hr_import_audits';
export const HR_IMPORT_RUNS_COLLECTION = 'hr_import_runs';

// ステータス変換マップ
export const FREEE_STATUS_MAP: Record<string, EmployeeStatus> = {
  'working': 'ACTIVE',
  'retired': 'INACTIVE',
};

// 雇用形態変換マップ
export const EMPLOYMENT_TYPE_MAP: Record<string, EmploymentType> = {
  '役員': '役員',
  '正社員': '正社員',
  '契約社員': '契約社員',
  'パート': 'パート',
  'アルバイト': 'パート',
  '派遣': '派遣',
  'インターン': 'インターン',
  'executive': '役員',
  'full_time': '正社員',
  'contract': '契約社員',
  'part_time': 'パート',
  'dispatch': '派遣',
  'intern': 'インターン',
};

// デフォルト雇用形態
export const DEFAULT_EMPLOYMENT_TYPE: EmploymentType = '正社員';
