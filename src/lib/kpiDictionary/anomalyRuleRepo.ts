/**
 * KPI異常検知ルールリポジトリ
 *
 * DB優先、configフォールバック
 * インメモリストレージ（本番ではDBに置き換え）
 */

import type { KPIAnomalyRule, UpdateAnomalyRuleRequest } from './types';
import type { AlertConfig } from '@/lib/kpi/types';

// インメモリストレージ
const rulesStore = new Map<string, KPIAnomalyRule>();

// configフォールバック（デフォルトルール）
const DEFAULT_ANOMALY_RULES: Record<string, Partial<KPIAnomalyRule>> = {
  pending_approvals: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: 10,
    thresholdLow: null,
    maxPercentChange: 50,
    compareTo: 'prevDay',
  },
  occupancy_rate: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: null,
    thresholdLow: 85,
    maxPercentChange: 10,
    compareTo: 'prevWeek',
  },
  incident_count: {
    enabled: true,
    missingDataAlert: false,
    thresholdHigh: 5,
    thresholdLow: null,
    maxPercentChange: 100,
    compareTo: 'prevDay',
  },
  hiyari_count: {
    enabled: true,
    missingDataAlert: false,
    thresholdHigh: null,
    thresholdLow: 5,
    maxPercentChange: null,
    compareTo: null,
  },
  staff_turnover: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: 20,
    thresholdLow: null,
    maxPercentChange: 30,
    compareTo: 'prevWeek',
  },
  revenue_per_resident: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: null,
    thresholdLow: 20,
    maxPercentChange: 15,
    compareTo: 'prevWeek',
  },
  approval_lead_time: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: 5,
    thresholdLow: null,
    maxPercentChange: 50,
    compareTo: 'prevDay',
  },
};

// 初期化フラグ
let isInitialized = false;

/**
 * デフォルトルールで初期化
 */
function initializeStore(): void {
  if (isInitialized) return;

  const now = new Date().toISOString();

  // デフォルトルールをストアに追加
  for (const [kpiId, partialRule] of Object.entries(DEFAULT_ANOMALY_RULES)) {
    const rule: KPIAnomalyRule = {
      kpiId,
      enabled: partialRule.enabled ?? true,
      missingDataAlert: partialRule.missingDataAlert ?? true,
      thresholdHigh: partialRule.thresholdHigh ?? null,
      thresholdLow: partialRule.thresholdLow ?? null,
      maxPercentChange: partialRule.maxPercentChange ?? null,
      compareTo: partialRule.compareTo ?? null,
      zScoreWindowDays: partialRule.zScoreWindowDays ?? null,
      zScoreThreshold: partialRule.zScoreThreshold ?? null,
      updatedAt: now,
    };
    rulesStore.set(kpiId, rule);
  }

  isInitialized = true;
}

/**
 * 異常検知ルールを取得
 * DB優先、なければconfigフォールバック
 */
export function getAnomalyRule(kpiId: string): KPIAnomalyRule | null {
  initializeStore();

  // DB（ストア）から取得
  const dbRule = rulesStore.get(kpiId);
  if (dbRule) {
    return dbRule;
  }

  // configフォールバック
  const configRule = DEFAULT_ANOMALY_RULES[kpiId];
  if (configRule) {
    const now = new Date().toISOString();
    return {
      kpiId,
      enabled: configRule.enabled ?? true,
      missingDataAlert: configRule.missingDataAlert ?? true,
      thresholdHigh: configRule.thresholdHigh ?? null,
      thresholdLow: configRule.thresholdLow ?? null,
      maxPercentChange: configRule.maxPercentChange ?? null,
      compareTo: configRule.compareTo ?? null,
      zScoreWindowDays: configRule.zScoreWindowDays ?? null,
      zScoreThreshold: configRule.zScoreThreshold ?? null,
      updatedAt: now,
    };
  }

  return null;
}

/**
 * 異常検知ルールを更新（upsert）
 */
export function upsertAnomalyRule(
  kpiId: string,
  patch: UpdateAnomalyRuleRequest,
  actorUserId?: string
): { success: boolean; rule?: KPIAnomalyRule; error?: string } {
  initializeStore();

  const existing = rulesStore.get(kpiId);
  const now = new Date().toISOString();

  if (existing) {
    // 更新
    const updated: KPIAnomalyRule = {
      ...existing,
      ...patch,
      updatedAt: now,
    };
    rulesStore.set(kpiId, updated);
    return { success: true, rule: updated };
  } else {
    // 新規作成
    const newRule: KPIAnomalyRule = {
      kpiId,
      enabled: patch.enabled ?? true,
      missingDataAlert: patch.missingDataAlert ?? true,
      thresholdHigh: patch.thresholdHigh ?? null,
      thresholdLow: patch.thresholdLow ?? null,
      maxPercentChange: patch.maxPercentChange ?? null,
      compareTo: patch.compareTo ?? null,
      zScoreWindowDays: patch.zScoreWindowDays ?? null,
      zScoreThreshold: patch.zScoreThreshold ?? null,
      updatedAt: now,
    };
    rulesStore.set(kpiId, newRule);
    return { success: true, rule: newRule };
  }
}

/**
 * 有効なルール一覧を取得
 */
export function listEnabledRules(): KPIAnomalyRule[] {
  initializeStore();

  const rules: KPIAnomalyRule[] = [];

  for (const rule of rulesStore.values()) {
    if (rule.enabled) {
      rules.push(rule);
    }
  }

  return rules;
}

/**
 * 全ルール一覧を取得
 */
export function listAllRules(): KPIAnomalyRule[] {
  initializeStore();
  return Array.from(rulesStore.values());
}

/**
 * KPIAnomalyRuleをAlertConfigに変換
 * 既存の異常検知ロジックとの互換性のため
 */
export function toAlertConfig(rule: KPIAnomalyRule): AlertConfig {
  return {
    kpiId: rule.kpiId,
    enabled: rule.enabled,
    spikeThresholdPercent: rule.maxPercentChange ?? 30,
    dropThresholdPercent: rule.maxPercentChange ?? 30,
    warningThreshold: rule.thresholdHigh ?? rule.thresholdLow ?? undefined,
    criticalThreshold: undefined, // 別途設定が必要な場合
    detectMissingData: rule.missingDataAlert,
    notifySlack: true,
    notifyLineWorks: true,
  };
}

/**
 * 有効なAlertConfig一覧を取得
 * 既存の異常検知ロジックとの互換性のため
 */
export function listEnabledAlertConfigs(): AlertConfig[] {
  const rules = listEnabledRules();
  return rules.map(toAlertConfig);
}

/**
 * ストアをクリア（テスト用）
 */
export function clearAnomalyRulesStore(): void {
  rulesStore.clear();
  isInitialized = false;
}
