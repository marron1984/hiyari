// ======== AI副社長「今日のTODO」自動生成 型定義 ========

/**
 * TODO優先度
 */
export type TodoPriority = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * TODOソース（データ取得元）
 */
export type TodoSource =
  | 'OVERTIME'      // 残業・勤怠
  | 'APPROVAL'      // 承認待ち
  | 'SALES'         // 営業案件
  | 'DOCUMENT'      // 書類
  | 'PROSPECT';     // 入居希望者

/**
 * ユーザーロール
 */
export type TodoRole = 'staff' | 'manager' | 'exec';

/**
 * TODOアイテム
 */
export interface TodoItem {
  id?: string;
  tenantId: string;
  userId: string;
  userRole: TodoRole;
  priority: TodoPriority;
  title: string;
  description: string;
  link: string;
  source: TodoSource;
  sourceId?: string;           // 元データのID
  dueDate?: Date;              // 期限
  staleDays?: number;          // 滞留日数
  isCompleted: boolean;
  completedAt?: Date;
  completedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  generatedAt: Date;           // バッチ生成日時
}

/**
 * TODO生成結果
 */
export interface TodoGenerationResult {
  success: boolean;
  generatedAt: Date;
  date: string;               // YYYY-MM-DD形式
  todos: TodoItem[];          // 生成されたTODOリスト
  summary: {
    total: number;
    byPriority: {
      HIGH: number;
      MEDIUM: number;
      LOW: number;
    };
    bySource: {
      OVERTIME: number;
      APPROVAL: number;
      SALES: number;
      DOCUMENT: number;
      PROSPECT: number;
    };
    byRole: {
      staff: number;
      manager: number;
      exec: number;
    };
  };
  errors: string[];
}

/**
 * TODO生成ログ（Firestore保存用）
 */
export interface TodoGenerationLog {
  id?: string;
  tenantId: string;
  type: 'daily-batch';
  generatedAt: Date;
  result: TodoGenerationResult;
  createdAt: Date;
}

/**
 * 未承認申請（承認系）
 */
export interface PendingApproval {
  id: string;
  type: 'ringi' | 'expense' | 'overtime' | 'application';
  title: string;
  applicantName: string;
  applicantId: string;
  createdAt: Date;
  staleDays: number;
  amount?: number;
  currentStep?: number;
  nextApproverId?: string;
}

/**
 * 勤怠アラート（労務系）
 */
export interface AttendanceAlert {
  id: string;
  userId: string;
  userName: string;
  date: string;
  type: 'NG' | 'WARN';
  reason: string;
  overtimeMinutes?: number;
  approvedMinutes?: number;
}

/**
 * 営業停滞案件（営業系）
 */
export interface StaleSalesCase {
  id: string;
  prospectName: string;
  stage: string;
  assignedTo: string;
  assignedToName: string;
  lastUpdated: Date;
  staleDays: number;
  expectedCloseDate?: Date;
  isOverdue: boolean;
}

/**
 * 未提出書類（書類系）
 */
export interface MissingDocument {
  id: string;
  documentType: string;
  targetId: string;
  targetName: string;
  targetType: 'prospect' | 'resident' | 'employee';
  dueDate?: Date;
  isOverdue: boolean;
  daysUntilDue?: number;
}

/**
 * TODO一覧取得オプション
 */
export interface GetTodosOptions {
  userId?: string;
  role?: TodoRole;
  priority?: TodoPriority;
  source?: TodoSource;
  includeCompleted?: boolean;
  date?: string;               // YYYY-MM-DD形式
  limit?: number;
}

/**
 * ダッシュボード用TODOサマリー
 */
export interface TodoDashboardSummary {
  date: string;
  totalTodos: number;
  completedTodos: number;
  pendingTodos: number;
  byPriority: {
    HIGH: { total: number; completed: number };
    MEDIUM: { total: number; completed: number };
    LOW: { total: number; completed: number };
  };
  bySource: Record<TodoSource, { total: number; completed: number }>;
  recentTodos: TodoItem[];
}

// ======== AI要約 ========

/**
 * AI要約生成用の構造化データ
 */
export interface TodoSummaryInput {
  date: string;
  role: TodoRole;
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    completed: number;
  };
  highlights: TodoHighlight[];
}

/**
 * 要約用ハイライト（重要事項抽出）
 */
export interface TodoHighlight {
  priority: TodoPriority;
  source: TodoSource;
  title: string;
  urgencyReason?: string;  // 緊急性の理由（例：「残業NG」「滞留3日」）
}

/**
 * TODO要約
 */
export interface TodoSummary {
  id?: string;
  tenantId: string;
  date: string;             // YYYY-MM-DD
  role: TodoRole;
  userId?: string;          // 個人向け要約の場合
  summary: string;          // AI生成要約（3文以内）
  generatedBy: 'ai' | 'rule';  // 生成方法
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
  createdAt: Date;
}

/**
 * ロール別トーン設定
 */
export interface RoleToneConfig {
  greeting: string;
  urgentPrefix: string;
  normalPrefix: string;
  closingPhrase: string;
}

/**
 * 要約生成結果
 */
export interface TodoSummaryResult {
  success: boolean;
  summary: string;
  generatedBy: 'ai' | 'rule';
  error?: string;
}
