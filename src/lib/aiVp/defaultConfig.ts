/**
 * AI副社長 デフォルト設定
 *
 * Implementation Ticket 062: AI副社長Top3スコア設定UIとDB永続化
 *
 * デフォルトの重み・閾値・多様性設定を定義
 * 設定がない場合や不完全な場合にこれで補完する
 */

// ========== 型定義 ==========

export interface AiVpWeights {
  // 資格
  licenses_expired: number;
  licenses_expiring30?: number;

  // 修繕
  repairs_highrisk: number;
  repairs_overdue?: number;

  // 是正措置
  ca_critical: number;
  ca_overdue?: number;

  // チケット
  tickets_urgent: number;
  tickets_overdue?: number;

  // 期限超過（汎用）
  overdue_generic: number;

  // アラート
  alerts_critical: number;
  alerts_warning?: number;

  // 財務系
  receivables_overdue: number;
  contracts_decision_overdue: number;
  collection_overdue_steps: number;
}

export interface AiVpThresholds {
  // 重大度判定
  severity_critical?: number;
  severity_warning?: number;

  // リスクレベル
  risk_critical?: number;
  risk_high?: number;
  risk_medium?: number;

  // 未収金
  receivables_critical_amount: number;
  receivables_warning_amount: number;
}

export interface AiVpDiversity {
  /** カテゴリごとの最大候補数 */
  maxPerCategory: number;
  /** 財務系候補の最大数 */
  maxFinanceCandidates: number;
  /** Top3の表示件数 */
  top3Limit?: number;
  /** 全事業Topの表示件数 */
  globalTopLimit?: number;
}

export interface AiVpConfig {
  weights: AiVpWeights;
  thresholds: AiVpThresholds;
  diversity: AiVpDiversity;
}

// ========== デフォルト設定 ==========

export const DEFAULT_WEIGHTS: AiVpWeights = {
  // 資格
  licenses_expired: 10,
  licenses_expiring30: 4,

  // 修繕
  repairs_highrisk: 8,
  repairs_overdue: 6,

  // 是正措置
  ca_critical: 8,
  ca_overdue: 6,

  // チケット
  tickets_urgent: 5,
  tickets_overdue: 4,

  // 期限超過（汎用）
  overdue_generic: 4,

  // アラート
  alerts_critical: 6,
  alerts_warning: 2,

  // 財務系
  receivables_overdue: 7,
  contracts_decision_overdue: 9,
  collection_overdue_steps: 5,
};

export const DEFAULT_THRESHOLDS: AiVpThresholds = {
  // 重大度判定
  severity_critical: 20,
  severity_warning: 10,

  // リスクレベル
  risk_critical: 50,
  risk_high: 30,
  risk_medium: 15,

  // 未収金
  receivables_critical_amount: 1000000,
  receivables_warning_amount: 500000,
};

export const DEFAULT_DIVERSITY: AiVpDiversity = {
  maxPerCategory: 2,
  maxFinanceCandidates: 2,
  top3Limit: 3,
  globalTopLimit: 5,
};

export const DEFAULT_CONFIG: AiVpConfig = {
  weights: DEFAULT_WEIGHTS,
  thresholds: DEFAULT_THRESHOLDS,
  diversity: DEFAULT_DIVERSITY,
};

// ========== ラベル（UI表示用） ==========

export const WEIGHT_LABELS: Record<keyof AiVpWeights, { label: string; category: string }> = {
  licenses_expired: { label: '資格期限切れ', category: '資格・研修' },
  licenses_expiring30: { label: '資格期限迫る（30日以内）', category: '資格・研修' },
  repairs_highrisk: { label: '高リスク修繕', category: '設備・修繕' },
  repairs_overdue: { label: '期限超過修繕', category: '設備・修繕' },
  ca_critical: { label: '重大是正措置', category: 'コンプライアンス' },
  ca_overdue: { label: '期限超過是正措置', category: 'コンプライアンス' },
  tickets_urgent: { label: '緊急チケット', category: '運用・チケット' },
  tickets_overdue: { label: '期限超過チケット', category: '運用・チケット' },
  overdue_generic: { label: '期限超過（汎用）', category: '運用・チケット' },
  alerts_critical: { label: '重大アラート', category: 'アラート' },
  alerts_warning: { label: '警告アラート', category: 'アラート' },
  receivables_overdue: { label: '未収金超過', category: '財務' },
  contracts_decision_overdue: { label: '契約判断期限超過', category: '財務' },
  collection_overdue_steps: { label: '回収フロー超過', category: '財務' },
};

export const THRESHOLD_LABELS: Record<keyof AiVpThresholds, string> = {
  severity_critical: '重大判定スコア閾値',
  severity_warning: '警告判定スコア閾値',
  risk_critical: 'リスクレベル「critical」閾値',
  risk_high: 'リスクレベル「high」閾値',
  risk_medium: 'リスクレベル「medium」閾値',
  receivables_critical_amount: '未収金「重大」金額（円）',
  receivables_warning_amount: '未収金「警告」金額（円）',
};

export const DIVERSITY_LABELS: Record<keyof AiVpDiversity, string> = {
  maxPerCategory: 'カテゴリ別最大件数',
  maxFinanceCandidates: '財務系最大件数',
  top3Limit: 'Top3表示件数',
  globalTopLimit: '全事業Top表示件数',
};

// ========== 必須キー ==========

export const REQUIRED_WEIGHT_KEYS: (keyof AiVpWeights)[] = [
  'licenses_expired',
  'repairs_highrisk',
  'ca_critical',
  'tickets_urgent',
  'overdue_generic',
  'alerts_critical',
  'receivables_overdue',
  'contracts_decision_overdue',
  'collection_overdue_steps',
];

export const REQUIRED_THRESHOLD_KEYS: (keyof AiVpThresholds)[] = [
  'receivables_critical_amount',
  'receivables_warning_amount',
];

export const REQUIRED_DIVERSITY_KEYS: (keyof AiVpDiversity)[] = [
  'maxPerCategory',
  'maxFinanceCandidates',
];
