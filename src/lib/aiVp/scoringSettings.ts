/**
 * AI副社長 スコアリング設定（互換レイヤー）
 *
 * Implementation Ticket 062: AI副社長Top3の重み（スコアリング）を管理画面から調整
 *
 * このファイルは businessTop3.ts との互換性を維持するためのラッパーです。
 * 実際の設定管理は settings.ts で行います。
 */

import {
  getAiVpConfig,
  saveAiVpConfig,
  resetAiVpConfig as resetSettings,
  getAiVpSettingsEvents,
  getAiVpSettingsMeta,
  DEFAULT_CONFIG as NEW_DEFAULT_CONFIG,
  WEIGHT_LABELS as NEW_WEIGHT_LABELS,
  THRESHOLD_LABELS as NEW_THRESHOLD_LABELS,
  type AiVpConfig,
} from './settings';

// ========== 型定義（businessTop3.ts 互換） ==========

export interface ScoringWeights {
  // 資格
  licenses_expired: number;
  licenses_expiring30: number;

  // 修繕
  repairs_highRiskOpen: number;
  repairs_overdue: number;

  // 是正措置
  correctiveActions_criticalOpen: number;
  correctiveActions_overdue: number;
  correctiveActions_open: number;

  // チケット
  tickets_urgentOpen: number;
  tickets_overdue: number;
  tickets_open: number;

  // アラート
  alerts_criticalOpen: number;
  alerts_warningOpen: number;

  // 未収・売掛（拡張用）
  receivables_criticalOverdue?: number;
  receivables_warningOverdue?: number;

  // 契約（拡張用）
  contracts_decisionOverdue?: number;

  // 回収フロー（拡張用）
  collection_overdueSteps?: number;
}

export interface ScoringThresholds {
  /** 重大判定のスコア閾値 */
  severityCritical: number;
  /** 警告判定のスコア閾値 */
  severityWarning: number;

  /** リスクレベル: critical閾値 */
  riskCritical: number;
  /** リスクレベル: high閾値 */
  riskHigh: number;
  /** リスクレベル: medium閾値 */
  riskMedium: number;

  /** 未収金: critical判定金額 */
  receivablesCriticalAmount?: number;
  /** 未収金: warning判定金額 */
  receivablesWarningAmount?: number;
}

export interface DiversitySettings {
  /** カテゴリごとの最大候補数 */
  maxPerCategory: number;
  /** 財務系候補の最大数 */
  maxFinanceCandidates: number;
  /** Top3の表示件数 */
  top3Limit: number;
  /** 全事業Top5の表示件数 */
  globalTopLimit: number;
}

export interface AiVpScoringConfig {
  weights: ScoringWeights;
  thresholds: ScoringThresholds;
  diversity: DiversitySettings;
}

export interface AiVpSettings {
  id: string;
  scope: 'global' | 'businessUnit';
  businessUnitId: string | null;
  config: AiVpScoringConfig;
  updatedAt: string;
  updatedByUserId: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  settingsId: string;
  action: 'create' | 'update' | 'reset';
  previousConfig: AiVpScoringConfig | null;
  newConfig: AiVpScoringConfig;
  userId: string;
  timestamp: string;
  changes: string[];  // 変更された項目のリスト
}

// ========== デフォルト設定（互換用） ==========

export const DEFAULT_WEIGHTS: ScoringWeights = {
  // 資格
  licenses_expired: 10,
  licenses_expiring30: 4,

  // 修繕
  repairs_highRiskOpen: 8,
  repairs_overdue: 6,

  // 是正措置
  correctiveActions_criticalOpen: 8,
  correctiveActions_overdue: 6,
  correctiveActions_open: 2,

  // チケット
  tickets_urgentOpen: 5,
  tickets_overdue: 4,
  tickets_open: 1,

  // アラート
  alerts_criticalOpen: 6,
  alerts_warningOpen: 2,

  // 拡張用
  receivables_criticalOverdue: 7,
  receivables_warningOverdue: 4,
  contracts_decisionOverdue: 9,
  collection_overdueSteps: 5,
};

export const DEFAULT_THRESHOLDS: ScoringThresholds = {
  severityCritical: 20,
  severityWarning: 10,

  riskCritical: 50,
  riskHigh: 30,
  riskMedium: 15,

  receivablesCriticalAmount: 1000000,
  receivablesWarningAmount: 500000,
};

export const DEFAULT_DIVERSITY: DiversitySettings = {
  maxPerCategory: 2,
  maxFinanceCandidates: 2,
  top3Limit: 3,
  globalTopLimit: 5,
};

export const DEFAULT_CONFIG: AiVpScoringConfig = {
  weights: DEFAULT_WEIGHTS,
  thresholds: DEFAULT_THRESHOLDS,
  diversity: DEFAULT_DIVERSITY,
};

/** 重みのラベル（UI表示用） */
export const WEIGHT_LABELS: Record<keyof ScoringWeights, { label: string; category: string }> = {
  licenses_expired: { label: '資格期限切れ', category: '資格・研修' },
  licenses_expiring30: { label: '資格期限迫る（30日以内）', category: '資格・研修' },
  repairs_highRiskOpen: { label: '高リスク修繕', category: '設備・修繕' },
  repairs_overdue: { label: '期限超過修繕', category: '設備・修繕' },
  correctiveActions_criticalOpen: { label: '重大是正措置', category: 'コンプライアンス' },
  correctiveActions_overdue: { label: '期限超過是正措置', category: 'コンプライアンス' },
  correctiveActions_open: { label: '是正措置（未完了）', category: 'コンプライアンス' },
  tickets_urgentOpen: { label: '緊急チケット', category: '運用・チケット' },
  tickets_overdue: { label: '期限超過チケット', category: '運用・チケット' },
  tickets_open: { label: 'チケット（未完了）', category: '運用・チケット' },
  alerts_criticalOpen: { label: '重大アラート', category: 'アラート' },
  alerts_warningOpen: { label: '警告アラート', category: 'アラート' },
  receivables_criticalOverdue: { label: '未収金（重大）', category: '財務' },
  receivables_warningOverdue: { label: '未収金（警告）', category: '財務' },
  contracts_decisionOverdue: { label: '契約判断期限超過', category: '財務' },
  collection_overdueSteps: { label: '回収フロー超過', category: '財務' },
};

/** 閾値のラベル（UI表示用） */
export const THRESHOLD_LABELS: Record<keyof ScoringThresholds, string> = {
  severityCritical: '重大判定スコア閾値',
  severityWarning: '警告判定スコア閾値',
  riskCritical: 'リスクレベル「critical」閾値',
  riskHigh: 'リスクレベル「high」閾値',
  riskMedium: 'リスクレベル「medium」閾値',
  receivablesCriticalAmount: '未収金「重大」金額（円）',
  receivablesWarningAmount: '未収金「警告」金額（円）',
};

// ========== 設定変換ヘルパー ==========

/**
 * 新しい設定形式からbusinessTop3.ts互換形式に変換
 */
function convertToScoringWeights(config: AiVpConfig): ScoringWeights {
  const w = config.weights;
  return {
    licenses_expired: w.licenses_expired,
    licenses_expiring30: w.licenses_expiring30 ?? 4,
    repairs_highRiskOpen: w.repairs_highrisk,
    repairs_overdue: w.repairs_overdue ?? 6,
    correctiveActions_criticalOpen: w.ca_critical,
    correctiveActions_overdue: w.ca_overdue ?? 6,
    correctiveActions_open: 2,
    tickets_urgentOpen: w.tickets_urgent,
    tickets_overdue: w.tickets_overdue ?? 4,
    tickets_open: 1,
    alerts_criticalOpen: w.alerts_critical,
    alerts_warningOpen: w.alerts_warning ?? 2,
    receivables_criticalOverdue: w.receivables_overdue,
    receivables_warningOverdue: 4,
    contracts_decisionOverdue: w.contracts_decision_overdue,
    collection_overdueSteps: w.collection_overdue_steps,
  };
}

function convertToScoringThresholds(config: AiVpConfig): ScoringThresholds {
  const t = config.thresholds;
  return {
    severityCritical: t.severity_critical ?? 20,
    severityWarning: t.severity_warning ?? 10,
    riskCritical: t.risk_critical ?? 50,
    riskHigh: t.risk_high ?? 30,
    riskMedium: t.risk_medium ?? 15,
    receivablesCriticalAmount: t.receivables_critical_amount,
    receivablesWarningAmount: t.receivables_warning_amount,
  };
}

function convertToDiversitySettings(config: AiVpConfig): DiversitySettings {
  const d = config.diversity;
  return {
    maxPerCategory: d.maxPerCategory,
    maxFinanceCandidates: d.maxFinanceCandidates,
    top3Limit: d.top3Limit ?? 3,
    globalTopLimit: d.globalTopLimit ?? 5,
  };
}

// ========== グローバル設定ID ==========

const GLOBAL_SETTINGS_ID = 'ai_vp_global';

// ========== CRUD（settings.ts にデリゲート） ==========

/**
 * グローバル設定を取得（なければデフォルトを返す）
 */
export function getGlobalSettings(): AiVpSettings {
  const config = getAiVpConfig();
  const meta = getAiVpSettingsMeta();

  return {
    id: GLOBAL_SETTINGS_ID,
    scope: 'global',
    businessUnitId: null,
    config: {
      weights: convertToScoringWeights(config),
      thresholds: convertToScoringThresholds(config),
      diversity: convertToDiversitySettings(config),
    },
    updatedAt: meta.updatedAt ?? new Date().toISOString(),
    updatedByUserId: meta.updatedByUserId ?? 'system',
    createdAt: meta.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * グローバル設定を更新
 */
export function updateGlobalSettings(
  config: Partial<AiVpScoringConfig>,
  userId: string
): AiVpSettings {
  // 現在の設定を取得
  const currentConfig = getAiVpConfig();

  // 互換形式から新形式に変換してマージ
  const newWeights = config.weights ? {
    licenses_expired: config.weights.licenses_expired ?? currentConfig.weights.licenses_expired,
    licenses_expiring30: config.weights.licenses_expiring30 ?? currentConfig.weights.licenses_expiring30,
    repairs_highrisk: config.weights.repairs_highRiskOpen ?? currentConfig.weights.repairs_highrisk,
    repairs_overdue: config.weights.repairs_overdue ?? currentConfig.weights.repairs_overdue,
    ca_critical: config.weights.correctiveActions_criticalOpen ?? currentConfig.weights.ca_critical,
    ca_overdue: config.weights.correctiveActions_overdue ?? currentConfig.weights.ca_overdue,
    tickets_urgent: config.weights.tickets_urgentOpen ?? currentConfig.weights.tickets_urgent,
    tickets_overdue: config.weights.tickets_overdue ?? currentConfig.weights.tickets_overdue,
    overdue_generic: currentConfig.weights.overdue_generic,
    alerts_critical: config.weights.alerts_criticalOpen ?? currentConfig.weights.alerts_critical,
    alerts_warning: config.weights.alerts_warningOpen ?? currentConfig.weights.alerts_warning,
    receivables_overdue: config.weights.receivables_criticalOverdue ?? currentConfig.weights.receivables_overdue,
    contracts_decision_overdue: config.weights.contracts_decisionOverdue ?? currentConfig.weights.contracts_decision_overdue,
    collection_overdue_steps: config.weights.collection_overdueSteps ?? currentConfig.weights.collection_overdue_steps,
  } : currentConfig.weights;

  const newThresholds = config.thresholds ? {
    severity_critical: config.thresholds.severityCritical ?? currentConfig.thresholds.severity_critical,
    severity_warning: config.thresholds.severityWarning ?? currentConfig.thresholds.severity_warning,
    risk_critical: config.thresholds.riskCritical ?? currentConfig.thresholds.risk_critical,
    risk_high: config.thresholds.riskHigh ?? currentConfig.thresholds.risk_high,
    risk_medium: config.thresholds.riskMedium ?? currentConfig.thresholds.risk_medium,
    receivables_critical_amount: config.thresholds.receivablesCriticalAmount ?? currentConfig.thresholds.receivables_critical_amount,
    receivables_warning_amount: config.thresholds.receivablesWarningAmount ?? currentConfig.thresholds.receivables_warning_amount,
  } : currentConfig.thresholds;

  const newDiversity = config.diversity ? {
    maxPerCategory: config.diversity.maxPerCategory ?? currentConfig.diversity.maxPerCategory,
    maxFinanceCandidates: config.diversity.maxFinanceCandidates ?? currentConfig.diversity.maxFinanceCandidates,
    top3Limit: config.diversity.top3Limit ?? currentConfig.diversity.top3Limit,
    globalTopLimit: config.diversity.globalTopLimit ?? currentConfig.diversity.globalTopLimit,
  } : currentConfig.diversity;

  // 新しい設定を保存
  const result = saveAiVpConfig(
    { weights: newWeights, thresholds: newThresholds, diversity: newDiversity },
    userId
  );

  if (!result.success) {
    console.error('[scoringSettings] Failed to save:', result.errors);
  }

  return getGlobalSettings();
}

/**
 * グローバル設定をデフォルトにリセット
 */
export function resetGlobalSettings(userId: string): AiVpSettings {
  resetSettings(userId);
  return getGlobalSettings();
}

// ========== 有効な設定を取得（スコアリング用） ==========

/**
 * 有効なスコアリング重みを取得
 *
 * businessTop3.ts から呼び出される
 */
export function getEffectiveWeights(businessUnitId?: string): ScoringWeights {
  // TODO: 将来的に事業別設定に対応
  const settings = getGlobalSettings();
  return settings.config.weights;
}

/**
 * 有効な閾値を取得
 */
export function getEffectiveThresholds(businessUnitId?: string): ScoringThresholds {
  const settings = getGlobalSettings();
  return settings.config.thresholds;
}

/**
 * 有効な多様性設定を取得
 */
export function getEffectiveDiversity(businessUnitId?: string): DiversitySettings {
  const settings = getGlobalSettings();
  return settings.config.diversity;
}

// ========== 監査ログ（settings.ts にデリゲート） ==========

/**
 * 監査ログを取得
 */
export function getAuditLog(
  options: { limit?: number; settingsId?: string } = {}
): AuditLogEntry[] {
  const { limit = 50 } = options;
  const events = getAiVpSettingsEvents(limit);

  // 新しい形式から互換形式に変換
  return events.map((e) => ({
    id: e.id,
    settingsId: GLOBAL_SETTINGS_ID,
    action: e.action as 'create' | 'update' | 'reset',
    previousConfig: e.beforeJson ? {
      weights: convertToScoringWeights(e.beforeJson),
      thresholds: convertToScoringThresholds(e.beforeJson),
      diversity: convertToDiversitySettings(e.beforeJson),
    } : null,
    newConfig: {
      weights: convertToScoringWeights(e.afterJson),
      thresholds: convertToScoringThresholds(e.afterJson),
      diversity: convertToDiversitySettings(e.afterJson),
    },
    userId: e.actorUserId,
    timestamp: e.createdAt,
    changes: e.note ? [e.note] : [],
  }));
}

// ========== 統計 ==========

export function getStats(): {
  totalSettings: number;
  totalAuditEntries: number;
  lastUpdated: string | null;
} {
  const meta = getAiVpSettingsMeta();
  const events = getAiVpSettingsEvents(1000);
  return {
    totalSettings: 1,
    totalAuditEntries: events.length,
    lastUpdated: meta.updatedAt,
  };
}
