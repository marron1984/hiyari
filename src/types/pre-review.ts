// ======== 決裁前レビューゲート 型定義 ========

// ======== 申請種別 ========
export type ApplicationType = 'expense' | 'overtime';

// ======== フラグ種別 ========
export type ReviewFlagType =
  | 'amount_exceeded'      // 金額超過
  | 'high_frequency'       // 頻度過多
  | 'no_attachment'        // 添付不足
  | 'late_night'           // 深夜申請
  | 'consecutive_days'     // 連続申請
  | 'weekend_holiday'      // 土日祝申請
  | 'budget_warning'       // 予算警告
  | 'unusual_pattern';     // 異常パターン

// ======== フラグ詳細 ========
export interface ReviewFlag {
  type: ReviewFlagType;
  severity: 'info' | 'warning' | 'attention';
  title: string;
  description: string;
  context?: Record<string, string | number | boolean>;
}

// ======== フラグ条件設定 ========
export interface FlagConditions {
  // 経費申請用
  expense: {
    amountThreshold: number;              // 金額超過閾値（円）
    frequencyLimit: number;               // 月間申請上限回数
    frequencyDays: number;                // 頻度チェック期間（日）
    requireAttachmentAbove: number;       // 添付必須金額（円）
  };
  // 残業申請用
  overtime: {
    lateNightHour: number;                // 深夜とみなす時刻（22時など）
    consecutiveDaysLimit: number;         // 連続日数上限
    monthlyHoursWarning: number;          // 月間残業警告時間
    monthlyHoursLimit: number;            // 月間残業上限時間
  };
}

// ======== 経費申請データ ========
export interface ExpenseApplication {
  id?: string;
  applicantId: string;
  applicantName: string;
  branchId?: string;

  // 申請内容
  title: string;
  amount: number;
  category: string;
  description?: string;
  date: string;                           // YYYY-MM-DD

  // 添付
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
  }>;

  // 過去データ（フラグ判定用）
  recentApplicationCount?: number;        // 直近申請件数
  monthlyTotal?: number;                  // 今月の申請合計
}

// ======== 残業申請データ ========
export interface OvertimeApplication {
  id?: string;
  applicantId: string;
  applicantName: string;
  branchId?: string;

  // 申請内容
  date: string;                           // YYYY-MM-DD
  startTime: string;                      // HH:MM
  endTime: string;                        // HH:MM
  hours: number;
  reason: string;

  // 過去データ（フラグ判定用）
  consecutiveDays?: number;               // 連続残業日数
  monthlyHours?: number;                  // 今月の残業合計時間
  recentDates?: string[];                 // 直近の残業日
}

// ======== 申請データ（Union型） ========
export type ApplicationData =
  | { type: 'expense'; data: ExpenseApplication }
  | { type: 'overtime'; data: OvertimeApplication };

// ======== レビューリクエスト ========
export interface PreReviewRequest {
  applicationType: ApplicationType;
  application: ExpenseApplication | OvertimeApplication;
  tenantId?: string;
}

// ======== AIレビュー結果 ========
export interface AIReviewPoint {
  id: string;
  category: string;                       // 確認カテゴリ
  point: string;                          // 確認ポイント（質問形式）
  suggestion?: string;                    // 整理のヒント
  relatedFlag?: ReviewFlagType;
}

// ======== レビュー結果 ========
export interface PreReviewResult {
  // フラグ情報
  hasFlags: boolean;
  flags: ReviewFlag[];

  // AIレビュー（フラグありの場合のみ）
  aiReview?: {
    points: AIReviewPoint[];              // 確認ポイント（最大3）
    encouragement: string;                // 励ましメッセージ
    reviewedAt: Date;
    modelUsed: string;
  };

  // 判定
  canSubmit: boolean;                     // submit可能か
  requiresReview: boolean;                // レビュー必要か

  // メタ
  checkedAt: Date;
}

// ======== レビューログ（監査用） ========
export interface PreReviewLog {
  id: string;
  tenantId: string;

  // 申請情報
  applicationType: ApplicationType;
  applicationId?: string;
  applicantId: string;
  applicantName: string;
  branchId?: string;

  // フラグ
  flags: ReviewFlag[];
  flagCount: number;

  // AIレビュー
  aiReviewPoints?: AIReviewPoint[];

  // 結果
  outcome: 'submitted' | 'modified' | 'cancelled';
  modificationsMade?: string[];           // 修正内容

  // タイムスタンプ
  reviewedAt: Date;
  submittedAt?: Date;

  // 申請データスナップショット（サマリ）
  applicationSummary: {
    title?: string;
    amount?: number;
    hours?: number;
    date: string;
  };
}

// ======== 吉田向けサマリ ========
export interface PreReviewSummary {
  period: {
    from: string;                         // YYYY-MM-DD
    to: string;
  };

  // 統計
  stats: {
    totalReviews: number;
    expenseReviews: number;
    overtimeReviews: number;

    // フラグ別
    byFlag: Record<ReviewFlagType, number>;

    // 結果別
    submitted: number;
    modified: number;
    cancelled: number;
  };

  // 注意ケース（要確認）
  attentionCases: Array<{
    logId: string;
    applicantName: string;
    applicationType: ApplicationType;
    flags: ReviewFlagType[];
    summary: string;
    reviewedAt: string;
  }>;
}

// ======== APIレスポンス ========
export interface PreReviewResponse {
  success: boolean;
  result?: PreReviewResult;
  error?: string;
}

export interface PreReviewLogResponse {
  success: boolean;
  logs?: PreReviewLog[];
  total?: number;
  error?: string;
}

export interface PreReviewSummaryResponse {
  success: boolean;
  summary?: PreReviewSummary;
  error?: string;
}

// ======== コレクション名 ========
export const PRE_REVIEW_LOGS_COLLECTION = 'pre_review_logs';

// ======== デフォルト条件 ========
export const DEFAULT_FLAG_CONDITIONS: FlagConditions = {
  expense: {
    amountThreshold: 50000,               // 5万円超
    frequencyLimit: 10,                   // 月10回超
    frequencyDays: 30,                    // 30日間
    requireAttachmentAbove: 10000,        // 1万円超は添付必須
  },
  overtime: {
    lateNightHour: 22,                    // 22時以降は深夜
    consecutiveDaysLimit: 3,              // 3日連続で警告
    monthlyHoursWarning: 30,              // 月30時間で警告
    monthlyHoursLimit: 45,                // 月45時間で注意
  },
};

// ======== フラグ表示情報 ========
export const FLAG_LABELS: Record<ReviewFlagType, { title: string; description: string }> = {
  amount_exceeded: {
    title: '金額確認',
    description: '通常より高額な申請です',
  },
  high_frequency: {
    title: '頻度確認',
    description: '申請頻度が多くなっています',
  },
  no_attachment: {
    title: '添付確認',
    description: '領収書・証憑の添付をご確認ください',
  },
  late_night: {
    title: '深夜残業',
    description: '22時以降の残業申請です',
  },
  consecutive_days: {
    title: '連続残業',
    description: '複数日連続の残業申請です',
  },
  weekend_holiday: {
    title: '休日出勤',
    description: '土日祝の残業申請です',
  },
  budget_warning: {
    title: '予算確認',
    description: '部門予算に近づいています',
  },
  unusual_pattern: {
    title: 'パターン確認',
    description: '通常と異なるパターンが検出されました',
  },
};
