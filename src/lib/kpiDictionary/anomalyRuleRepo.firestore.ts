/**
 * KPI異常検知ルールリポジトリ（Firestore版）
 *
 * DB優先、configフォールバック
 * Firestore永続化実装
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type { KPIAnomalyRule, UpdateAnomalyRuleRequest } from './types';
import type { AlertConfig } from '@/lib/kpi/types';

// ========== コレクション名 ==========

const RULES_COLLECTION = 'kpi_anomaly_rules';

// ========== configフォールバック（デフォルトルール） ==========

const DEFAULT_ANOMALY_RULES: Record<string, Partial<KPIAnomalyRule>> = {
  pending_approvals: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: 10,
    thresholdLow: null,
    maxPercentChange: 50,
    compareTo: 'prevDay',
    ruleReason: '未承認申請が溜まると業務が停滞し、従業員の不満や意思決定の遅れを招く',
  },
  occupancy_rate: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: null,
    thresholdLow: 85,
    maxPercentChange: 10,
    compareTo: 'prevWeek',
    ruleReason: '入居率が85%を下回ると固定費の回収が困難になり、経営へ直接影響',
  },
  incident_count: {
    enabled: true,
    missingDataAlert: false,
    thresholdHigh: 5,
    thresholdLow: null,
    maxPercentChange: 100,
    compareTo: 'prevDay',
    ruleReason: '事故件数が閾値を超えると入居者の安全・信頼に直結する重大リスク',
  },
  hiyari_count: {
    enabled: true,
    missingDataAlert: false,
    thresholdHigh: null,
    thresholdLow: 5,
    maxPercentChange: null,
    compareTo: null,
    ruleReason: 'ヒヤリハット報告数の減少は安全意識の低下や報告文化の衰退を示す可能性',
  },
  staff_turnover: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: 20,
    thresholdLow: null,
    maxPercentChange: 30,
    compareTo: 'prevWeek',
    ruleReason: '離職率20%超は採用・教育コストの増大とサービス品質低下を招く',
  },
  revenue_per_resident: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: null,
    thresholdLow: 20,
    maxPercentChange: 15,
    compareTo: 'prevWeek',
    ruleReason: '入居者単価の低下は収益性の悪化を意味し、持続可能性に影響',
  },
  approval_lead_time: {
    enabled: true,
    missingDataAlert: true,
    thresholdHigh: 5,
    thresholdLow: null,
    maxPercentChange: 50,
    compareTo: 'prevDay',
    ruleReason: '承認に5日以上かかると業務停滞・従業員モチベーション低下のリスク',
  },
};

// ========== ドキュメント変換 ==========

function docToRule(doc: FirebaseFirestore.DocumentSnapshot): KPIAnomalyRule {
  const d = doc.data()!;
  return {
    kpiId: doc.id,
    enabled: d.enabled ?? true,
    missingDataAlert: d.missingDataAlert ?? true,
    thresholdHigh: d.thresholdHigh ?? null,
    thresholdLow: d.thresholdLow ?? null,
    maxPercentChange: d.maxPercentChange ?? null,
    compareTo: d.compareTo ?? null,
    zScoreWindowDays: d.zScoreWindowDays ?? null,
    zScoreThreshold: d.zScoreThreshold ?? null,
    ruleReason: d.ruleReason ?? null,
    updatedAt: d.updatedAt,
  };
}

// ========== CRUD ==========

/**
 * 異常検知ルールを取得
 * DB優先、なければconfigフォールバック
 */
export async function getAnomalyRule(kpiId: string): Promise<KPIAnomalyRule | null> {
  const db = getAdminDb();
  const doc = await db.collection(RULES_COLLECTION).doc(kpiId).get();

  if (doc.exists) {
    return docToRule(doc);
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
      ruleReason: configRule.ruleReason ?? null,
      updatedAt: now,
    };
  }

  return null;
}

/**
 * 異常検知ルールを更新（upsert）
 */
export async function upsertAnomalyRule(
  kpiId: string,
  patch: UpdateAnomalyRuleRequest,
  actorUserId?: string
): Promise<{ success: boolean; rule?: KPIAnomalyRule; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(RULES_COLLECTION).doc(kpiId);
  const doc = await docRef.get();
  const now = new Date().toISOString();

  if (doc.exists) {
    // 更新
    await docRef.update({
      ...patch,
      updatedAt: now,
    });
  } else {
    // 新規作成
    const newRuleData = {
      enabled: patch.enabled ?? true,
      missingDataAlert: patch.missingDataAlert ?? true,
      thresholdHigh: patch.thresholdHigh ?? null,
      thresholdLow: patch.thresholdLow ?? null,
      maxPercentChange: patch.maxPercentChange ?? null,
      compareTo: patch.compareTo ?? null,
      zScoreWindowDays: patch.zScoreWindowDays ?? null,
      zScoreThreshold: patch.zScoreThreshold ?? null,
      ruleReason: patch.ruleReason ?? null,
      updatedAt: now,
    };
    await docRef.set(newRuleData);
  }

  const updatedDoc = await docRef.get();
  const rule = docToRule(updatedDoc);
  return { success: true, rule };
}

/**
 * 有効なルール一覧を取得
 */
export async function listEnabledRules(): Promise<KPIAnomalyRule[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(RULES_COLLECTION)
    .where('enabled', '==', true)
    .get();

  const dbRules = snapshot.docs.map(docToRule);

  // DBにない分はconfigフォールバックで補完
  const dbKpiIds = new Set(dbRules.map((r) => r.kpiId));
  const fallbackRules: KPIAnomalyRule[] = [];

  for (const [kpiId, partialRule] of Object.entries(DEFAULT_ANOMALY_RULES)) {
    if (!dbKpiIds.has(kpiId) && partialRule.enabled !== false) {
      const now = new Date().toISOString();
      fallbackRules.push({
        kpiId,
        enabled: partialRule.enabled ?? true,
        missingDataAlert: partialRule.missingDataAlert ?? true,
        thresholdHigh: partialRule.thresholdHigh ?? null,
        thresholdLow: partialRule.thresholdLow ?? null,
        maxPercentChange: partialRule.maxPercentChange ?? null,
        compareTo: partialRule.compareTo ?? null,
        zScoreWindowDays: partialRule.zScoreWindowDays ?? null,
        zScoreThreshold: partialRule.zScoreThreshold ?? null,
        ruleReason: partialRule.ruleReason ?? null,
        updatedAt: now,
      });
    }
  }

  return [...dbRules, ...fallbackRules];
}

/**
 * 全ルール一覧を取得
 */
export async function listAllRules(): Promise<KPIAnomalyRule[]> {
  const db = getAdminDb();
  const snapshot = await db.collection(RULES_COLLECTION).get();

  const dbRules = snapshot.docs.map(docToRule);

  // DBにない分はconfigフォールバックで補完
  const dbKpiIds = new Set(dbRules.map((r) => r.kpiId));
  const fallbackRules: KPIAnomalyRule[] = [];

  for (const [kpiId, partialRule] of Object.entries(DEFAULT_ANOMALY_RULES)) {
    if (!dbKpiIds.has(kpiId)) {
      const now = new Date().toISOString();
      fallbackRules.push({
        kpiId,
        enabled: partialRule.enabled ?? true,
        missingDataAlert: partialRule.missingDataAlert ?? true,
        thresholdHigh: partialRule.thresholdHigh ?? null,
        thresholdLow: partialRule.thresholdLow ?? null,
        maxPercentChange: partialRule.maxPercentChange ?? null,
        compareTo: partialRule.compareTo ?? null,
        zScoreWindowDays: partialRule.zScoreWindowDays ?? null,
        zScoreThreshold: partialRule.zScoreThreshold ?? null,
        ruleReason: partialRule.ruleReason ?? null,
        updatedAt: now,
      });
    }
  }

  return [...dbRules, ...fallbackRules];
}

/**
 * KPIAnomalyRuleをAlertConfigに変換
 */
export function toAlertConfig(rule: KPIAnomalyRule): AlertConfig {
  return {
    kpiId: rule.kpiId,
    enabled: rule.enabled,
    spikeThresholdPercent: rule.maxPercentChange ?? 30,
    dropThresholdPercent: rule.maxPercentChange ?? 30,
    warningThreshold: rule.thresholdHigh ?? rule.thresholdLow ?? undefined,
    criticalThreshold: undefined,
    detectMissingData: rule.missingDataAlert,
    notifySlack: true,
    notifyLineWorks: true,
  };
}

/**
 * 有効なAlertConfig一覧を取得
 */
export async function listEnabledAlertConfigs(): Promise<AlertConfig[]> {
  const rules = await listEnabledRules();
  return rules.map(toAlertConfig);
}

/**
 * ストアをクリア（テスト用）
 */
export async function clearAnomalyRulesStore(): Promise<void> {
  const db = getAdminDb();
  const snapshot = await db.collection(RULES_COLLECTION).get();
  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}
