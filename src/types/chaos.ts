// AA CHAOS 経営OS・営業OS 統合管理システム 型定義

// ======== 職員チェックイン ========

// 日次チェックイン入力（0-4の5段階）
export interface StaffCheckin {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  physicalFatigue: number; // 0-4 体力疲労
  mentalFatigue: number; // 0-4 精神疲労
  sleep: number; // 0-4 睡眠の質
  anxiety: number; // 0-4 不安・緊張
  decisionLoad: number; // 0-4 判断の重さ
  consulted: number; // 0-4 相談できた感
  note?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// 日次スコア（算出結果）
export interface StaffScoreDaily {
  id: string;
  userId: string;
  userName?: string;
  date: string;
  fatigueScore: number; // 0-100
  mentalLoadScore: number; // 0-100
  burnoutRiskScore: number; // 0-100
  burnoutRiskLevel: 'green' | 'yellow' | 'red';
  createdAt: Date;
}

// バーンアウトリスクの閾値設定
export interface BurnoutRiskConfig {
  yellowThreshold: number; // デフォルト: 60
  redThreshold: number; // デフォルト: 80
  consecutiveDaysForYellow: number; // デフォルト: 2
  consecutiveDaysForRed: number; // デフォルト: 3
  weeklyDeteriorationRateForRed: number; // デフォルト: 0.2 (20%)
}

export const DEFAULT_BURNOUT_RISK_CONFIG: BurnoutRiskConfig = {
  yellowThreshold: 60,
  redThreshold: 80,
  consecutiveDaysForYellow: 2,
  consecutiveDaysForRed: 3,
  weeklyDeteriorationRateForRed: 0.2,
};

// ======== サーバントリーダーシップ指数 ========

// 承認行動4分類
export type AcknowledgmentType = 'exist' | 'process' | 'decision' | 'result';

export interface ServantScore {
  id: string;
  managerId: string;
  managerName?: string;
  periodStart: string;
  periodEnd: string;
  existAck: number; // 存在承認 0-100
  processAck: number; // 手順承認 0-100
  decisionAck: number; // 決断承認 0-100
  resultAck: number; // 結果承認 0-100
  orderViolationPenalty: number; // 順序違反による減点
  totalScore: number; // 総合スコア 0-100
  sourcesJson?: string; // データソース詳細
  createdAt: Date;
}

// ======== 自己重要感・承認欲求 ========

export interface PsychScoreMonthly {
  id: string;
  userId: string;
  userName?: string;
  yearMonth: string; // YYYYMM
  selfImportance: number; // 0-100 自己重要感
  approvalNeed: number; // 0-100 承認欲求
  balance: number; // 0-100 バランス指標
  createdAt: Date;
}

// ======== KPI管理 ========

export type KpiScope = 'company' | 'property';

export interface KpiDictionary {
  id: string;
  key: string;
  name: string;
  description?: string;
  unit?: string;
  scope: KpiScope;
  formulaMd?: string;
  createdAt: Date;
}

export interface KpiSnapshotDaily {
  id: string;
  scopeType: KpiScope;
  scopeId: string; // company全体の場合は'all'、物件の場合はproperty_id
  date: string;
  metricsJson: string; // JSON形式のKPI値
  createdAt: Date;
}

// ======== WBR (Weekly Business Review) ========

export type WbrStatus = 'draft' | 'finalized';

export interface WbrReport {
  id: string;
  scopeType: KpiScope;
  scopeId: string;
  weekStart: string;
  weekEnd: string;
  metricsJson: string;
  narrativeMd?: string; // AI下書き→人が編集
  actionItemsJson?: string;
  status: WbrStatus;
  createdAt: Date;
  updatedAt?: Date;
}

export interface WbrActionItem {
  id: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
  status: 'open' | 'done' | 'cancelled';
}

// ======== 営業OS スコアリング ========

export type ProbabilityRank = 'A' | 'B' | 'C' | 'D';

export interface ScoringConfig {
  id: string;
  name: string;
  scopeType: KpiScope;
  scopeId?: string; // 物件単位の上書き用
  version: number;
  isActive: boolean;
  configJson: string; // スコアリングルールのJSON
  createdAt: Date;
}

// スコアリング設定の詳細
export interface ScoringRuleConfig {
  // 基本情報スコア
  ageScore: { min: number; max: number; weight: number }[];
  careLevelScore: Record<string, number>;
  contactMethodScore: Record<string, number>;

  // 行動スコア
  visitScheduledScore: number;
  visitCompletedScore: number;
  documentsSubmittedScore: number;

  // 時間経過による減点
  daysSinceContactPenalty: { days: number; penalty: number }[];

  // ランク閾値
  rankThresholds: {
    A: number; // 例: 80以上
    B: number; // 例: 60以上
    C: number; // 例: 40以上
    // D: それ未満
  };
}

export interface ScoringRun {
  id: string;
  caseId: string; // prospect_id
  propertyId?: string;
  configVersion: number;
  rawScore: number;
  probability: number; // 0-100
  rank: ProbabilityRank;
  recommendedAction: string;
  reasonsJson: string; // スコア内訳
  createdAt: Date;
}

export interface ScoringReason {
  factor: string;
  score: number;
  description: string;
}

// ======== 外部連携 ========

export interface IntakeEvent {
  id: string;
  source: string; // 'yoom', 'lineworks', 'manual'
  rawPayloadJson: string;
  rawTranscript?: string;
  processedAt?: Date;
  receivedAt: Date;
  createdAt: Date;
}

// ======== 介入管理 ========

export type InterventionType = 'checkin_alert' | 'stale_prospect' | 'support_request';
export type InterventionSeverity = 'info' | 'yellow' | 'red';
export type InterventionStatus = 'open' | 'done' | 'snoozed';

export interface Intervention {
  id: string;
  type: InterventionType;
  severity: InterventionSeverity;
  targetType: 'user' | 'prospect' | 'deal';
  targetId: string;
  targetName?: string;
  title: string;
  description?: string;
  payloadJson?: string;
  status: InterventionStatus;
  assigneeId?: string;
  assigneeName?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// ======== 監査ログ ========

export interface AuditLog {
  id: string;
  actorId: string;
  actorName?: string;
  action: string;
  entity: string;
  entityId: string;
  diffJson?: string;
  createdAt: Date;
}

// ======== ダッシュボード用集計型 ========

export interface ChaosDashboardMetrics {
  // 営業KPI
  sales: {
    leadCount: number; // LD数
    visitCount: number; // V数
    moveInCount: number; // M数（成約）
    initialResponseTime: number; // 初動リードタイム（時間）
    contactDistribution: Record<string, number>; // 接触回数分布
    probabilityDistribution: Record<ProbabilityRank, number>; // A/B/C/D分布
    expectedMoveIns: number; // 期待入居数
    expectedGrossProfit: number; // 期待粗利
  };
  // 経営OS KPI
  organization: {
    burnoutRiskHeatmap: { userId: string; userName: string; score: number; level: string }[];
    avgFatigue: number;
    avgMentalLoad: number;
    servantScores: { managerId: string; managerName: string; score: number }[];
    alertCount: { yellow: number; red: number };
  };
}

// ======== フォーム用型 ========

export interface CheckinFormData {
  physicalFatigue: number;
  mentalFatigue: number;
  sleep: number;
  anxiety: number;
  decisionLoad: number;
  consulted: number;
  note?: string;
}

export const CHECKIN_LABELS = {
  physicalFatigue: '体力疲労',
  mentalFatigue: '精神疲労',
  sleep: '睡眠の質',
  anxiety: '不安・緊張',
  decisionLoad: '判断の重さ',
  consulted: '相談できた感',
} as const;

export const CHECKIN_SCALE_LABELS = [
  '全くない',
  '少しある',
  'まあまあ',
  'かなりある',
  '非常に強い',
] as const;

// 支援目的の文言（評価ではないことを明示）
export const SUPPORT_PURPOSE_TEXT = 'この情報は支援のために使用されます。評価には直結しません。';
export const ONEONONE_PURPOSE_TEXT = '1on1は評価や指導ではなく、あなたを支えるための安全装置です。';

// 余裕メーター（社員向け表示）
export type MeterColor = 'green' | 'yellow' | 'red';

export const METER_LABELS: Record<MeterColor, string> = {
  green: '余裕あり',
  yellow: '余裕少なめ',
  red: 'サポートが必要',
} as const;

export const METER_COLORS: Record<MeterColor, { bg: string; text: string; border: string }> = {
  green: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  red: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
} as const;

// スコアから余裕メーターの色を判定
export function getMeterColor(score: number): MeterColor {
  if (score >= 70) return 'red';
  if (score >= 40) return 'yellow';
  return 'green';
}
