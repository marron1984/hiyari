// ======== AI副社長「人材リスク予測」型定義 ========
// 注意: 個人の離職断定・評価は禁止、主語は拠点・チーム

// ======== リスクレベル ========
export type RiskLevel =
  | 'stable'     // 安定
  | 'caution'    // 注意
  | 'warning'    // 警戒
  | 'critical';  // 要介入検討

// ======== スコアカテゴリ ========
export type ScoreCategory =
  | 'operational_load'     // 稼働負荷
  | 'behavioral_change'    // 行動変化
  | 'emotional_temperature' // 感情温度
  | 'operational_distortion'; // 運営歪み

// ======== 入力データ：勤怠集計 ========
export interface AttendanceMetrics {
  branchId: string;
  period: {
    from: string;  // YYYY-MM-DD
    to: string;
  };

  // 勤怠
  totalEmployees: number;
  avgWorkingHours: number;
  lateArrivalCount: number;       // 遅刻件数
  earlyLeaveCount: number;        // 早退件数
  absentCount: number;            // 欠勤件数
  paidLeaveUsageRate: number;     // 有給消化率（%）

  // 残業
  avgOvertimeHours: number;       // 平均残業時間
  maxOvertimeHours: number;       // 最大残業時間
  overtimeOver45Count: number;    // 45時間超の人数
  lateNightOvertimeCount: number; // 深夜残業件数
  consecutiveOvertimeDays: number; // 連続残業最大日数
}

// ======== 入力データ：申請頻度 ========
export interface ApplicationMetrics {
  branchId: string;
  period: {
    from: string;
    to: string;
  };

  // 経費申請
  expenseApplicationCount: number;
  expenseApplicationTotal: number;  // 合計金額
  avgExpensePerApplication: number;

  // 残業申請
  overtimeApplicationCount: number;

  // その他申請
  leaveApplicationCount: number;    // 休暇申請数
  transferRequestCount: number;     // 異動希望数（匿名集計）
}

// ======== 入力データ：LINE WORKS メタ指標 ========
export interface CommunicationMetrics {
  branchId: string;
  period: {
    from: string;
    to: string;
  };

  // メッセージ（匿名集計のみ）
  avgMessagesPerDay: number;        // 日平均メッセージ数
  responseTimeAvg: number;          // 平均応答時間（分）
  afterHoursMessageRate: number;    // 時間外メッセージ率（%）

  // 変化率
  messageVolumeChange: number;      // メッセージ量変化率（%）
  responseTimeChange: number;       // 応答時間変化率（%）
}

// ======== 入力データ：クレーム・人件費 ========
export interface OperationalMetrics {
  branchId: string;
  period: {
    from: string;
    to: string;
  };

  // クレーム
  complaintCount: number;           // クレーム件数
  complaintChangeRate: number;      // 前期比変化率（%）

  // 人件費
  laborCostRate: number;            // 人件費率（%）
  laborCostChangeRate: number;      // 前期比変化率（%）

  // 離職（匿名・拠点単位のみ）
  turnoverRate: number;             // 離職率（%）
  turnoverChangeRate: number;       // 前期比変化率（%）
}

// ======== 統合入力データ ========
export interface HumanRiskInput {
  branchId: string;
  branchName: string;
  tenantId: string;
  period: {
    from: string;
    to: string;
  };

  attendance?: AttendanceMetrics;
  applications?: ApplicationMetrics;
  communication?: CommunicationMetrics;
  operational?: OperationalMetrics;
}

// ======== スコア詳細 ========
export interface ScoreDetail {
  category: ScoreCategory;
  score: number;                    // 0-25
  label: string;                    // カテゴリ表示名
  factors: string[];                // 構成要因
  trend: 'improving' | 'stable' | 'worsening'; // 傾向
}

// ======== リスク主因 ========
export interface RiskFactor {
  id: string;
  category: ScoreCategory;
  title: string;                    // 主因タイトル
  description: string;              // 説明（個人名なし）
  impact: 'high' | 'medium' | 'low';
  dataPoints: string[];             // 根拠データ（匿名）
}

// ======== 参考アクション ========
export interface SuggestedAction {
  id: string;
  title: string;                    // アクションタイトル
  description: string;              // 説明（命令形禁止）
  category: 'communication' | 'workload' | 'environment' | 'support';
  priority: 'high' | 'medium' | 'low';
  note: string;                     // 補足（断定禁止）
}

// ======== リスク評価結果 ========
export interface HumanRiskAssessment {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;

  // 評価期間
  period: {
    from: string;
    to: string;
  };

  // 総合スコア
  totalScore: number;               // 0-100
  riskLevel: RiskLevel;

  // カテゴリ別スコア
  scores: ScoreDetail[];

  // リスク主因（最大3）
  mainFactors: RiskFactor[];

  // 参考アクション（最大3）
  suggestedActions: SuggestedAction[];

  // AI分析コメント
  aiComment: {
    summary: string;                // 概要（拠点・チーム主語）
    observation: string;            // 観察事項
    consideration: string;          // 検討事項
  };

  // 免責
  disclaimer: string;

  // タイムスタンプ
  assessedAt: Date;
  createdAt: Date;
}

// ======== 拠点リスクサマリ（一覧用） ========
export interface BranchRiskSummary {
  branchId: string;
  branchName: string;
  totalScore: number;
  riskLevel: RiskLevel;
  mainFactorTitles: string[];
  trend: 'improving' | 'stable' | 'worsening';
  assessedAt: string;
}

// ======== 通知（警戒以上） ========
export interface HumanRiskAlert {
  id: string;
  tenantId: string;
  assessmentId: string;
  branchId: string;
  branchName: string;

  riskLevel: 'warning' | 'critical';
  totalScore: number;
  mainFactors: string[];
  summary: string;

  status: 'unread' | 'read' | 'acknowledged';
  readAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;

  createdAt: Date;
}

// ======== APIリクエスト/レスポンス ========

// リスク評価リクエスト
export interface AssessRiskRequest {
  branchId: string;
  branchName: string;
  tenantId?: string;
  period?: {
    from: string;
    to: string;
  };
  // 入力データ（省略時はDBから取得）
  attendance?: AttendanceMetrics;
  applications?: ApplicationMetrics;
  communication?: CommunicationMetrics;
  operational?: OperationalMetrics;
}

// リスク評価レスポンス
export interface AssessRiskResponse {
  success: boolean;
  assessment?: HumanRiskAssessment;
  error?: string;
}

// 一覧レスポンス
export interface RiskSummaryListResponse {
  success: boolean;
  summaries?: BranchRiskSummary[];
  total?: number;
  error?: string;
}

// アラートレスポンス
export interface RiskAlertListResponse {
  success: boolean;
  alerts?: HumanRiskAlert[];
  unreadCount?: number;
  error?: string;
}

// ======== コレクション名 ========
export const HUMAN_RISK_ASSESSMENTS_COLLECTION = 'human_risk_assessments';
export const HUMAN_RISK_ALERTS_COLLECTION = 'human_risk_alerts';

// ======== リスクレベル閾値 ========
export const RISK_LEVEL_THRESHOLDS = {
  stable: { max: 30 },              // 0-30: 安定
  caution: { min: 31, max: 50 },    // 31-50: 注意
  warning: { min: 51, max: 70 },    // 51-70: 警戒
  critical: { min: 71 },            // 71-100: 要介入検討
};

// ======== リスクレベル表示 ========
export const RISK_LEVEL_LABELS: Record<RiskLevel, { label: string; color: string }> = {
  stable: { label: '安定', color: 'green' },
  caution: { label: '注意', color: 'yellow' },
  warning: { label: '警戒', color: 'orange' },
  critical: { label: '要介入検討', color: 'red' },
};

// ======== スコアカテゴリ表示 ========
export const SCORE_CATEGORY_LABELS: Record<ScoreCategory, string> = {
  operational_load: '稼働負荷',
  behavioral_change: '行動変化',
  emotional_temperature: '感情温度',
  operational_distortion: '運営歪み',
};

// ======== AIルール（プロンプト用） ========
export const AI_RULES = {
  FORBIDDEN_EXPRESSIONS: [
    '離職する',
    '辞める',
    '問題がある',
    '〜すべき',
    '〜してください',
    '〜しなければ',
  ],
  REQUIRED_SUBJECT: [
    '拠点',
    'チーム',
    '組織',
    '部門',
  ],
  RECOMMENDED_EXPRESSIONS: [
    '〜の傾向が見られます',
    '〜の可能性が考えられます',
    '〜を検討する余地があるかもしれません',
    '〜に注目すると良いかもしれません',
  ],
};
