/**
 * AI副社長 プリセット設定
 *
 * Implementation Ticket 063-fix: API規格化（reset/rollback/presets/preview整合）
 *
 * 運用シナリオに応じたプリセット設定を提供
 */

import type { AiVpConfig, AiVpWeights, AiVpThresholds, AiVpDiversity } from './defaultConfig';
import { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, DEFAULT_DIVERSITY } from './defaultConfig';

// ========== プリセット型定義 ==========

export interface AiVpPreset {
  id: string;
  name: string;
  description: string;
  /** プリセットの対象シナリオ */
  scenario: 'balanced' | 'compliance' | 'operations' | 'finance' | 'safety';
  /** 部分的な設定（DEFAULT_CONFIGにマージされる） */
  config: Partial<AiVpConfig>;
}

// ========== プリセット定義 ==========

/**
 * バランス型（デフォルト）
 */
const PRESET_BALANCED: AiVpPreset = {
  id: 'balanced',
  name: 'バランス型',
  description: '全カテゴリをバランスよく評価する標準設定',
  scenario: 'balanced',
  config: {
    weights: { ...DEFAULT_WEIGHTS },
    thresholds: { ...DEFAULT_THRESHOLDS },
    diversity: { ...DEFAULT_DIVERSITY },
  },
};

/**
 * コンプライアンス重視型
 */
const PRESET_COMPLIANCE: AiVpPreset = {
  id: 'compliance',
  name: 'コンプライアンス重視',
  description: '資格・是正措置など法令遵守項目を優先',
  scenario: 'compliance',
  config: {
    weights: {
      ...DEFAULT_WEIGHTS,
      // 資格を最優先
      licenses_expired: 15,
      licenses_expiring30: 8,
      // 是正措置を強化
      ca_critical: 12,
      ca_overdue: 9,
      // 運用系は抑制
      tickets_urgent: 3,
      tickets_overdue: 2,
    },
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      // 厳しめの閾値
      severity_critical: 15,
      severity_warning: 8,
    },
  },
};

/**
 * 運用効率重視型
 */
const PRESET_OPERATIONS: AiVpPreset = {
  id: 'operations',
  name: '運用効率重視',
  description: 'チケット・日常運用の効率化を優先',
  scenario: 'operations',
  config: {
    weights: {
      ...DEFAULT_WEIGHTS,
      // チケット系を強化
      tickets_urgent: 10,
      tickets_overdue: 8,
      overdue_generic: 7,
      // アラートも重視
      alerts_critical: 9,
      alerts_warning: 4,
      // コンプライアンス系は標準
      licenses_expired: 8,
      ca_critical: 6,
    },
    diversity: {
      ...DEFAULT_DIVERSITY,
      // より多くの候補を表示
      top3Limit: 5,
      globalTopLimit: 8,
    },
  },
};

/**
 * 財務重視型
 */
const PRESET_FINANCE: AiVpPreset = {
  id: 'finance',
  name: '財務重視',
  description: '未収金・契約・回収フローを優先',
  scenario: 'finance',
  config: {
    weights: {
      ...DEFAULT_WEIGHTS,
      // 財務系を最優先
      receivables_overdue: 12,
      contracts_decision_overdue: 14,
      collection_overdue_steps: 10,
      // 他は抑制
      tickets_urgent: 3,
      repairs_highrisk: 5,
    },
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      // 未収金の閾値を厳しく
      receivables_critical_amount: 500000,
      receivables_warning_amount: 200000,
    },
    diversity: {
      ...DEFAULT_DIVERSITY,
      // 財務系を多めに
      maxFinanceCandidates: 4,
    },
  },
};

/**
 * 安全重視型
 */
const PRESET_SAFETY: AiVpPreset = {
  id: 'safety',
  name: '安全重視',
  description: '修繕・設備の安全性を最優先',
  scenario: 'safety',
  config: {
    weights: {
      ...DEFAULT_WEIGHTS,
      // 修繕を最優先
      repairs_highrisk: 15,
      repairs_overdue: 10,
      // アラートも重視
      alerts_critical: 10,
      alerts_warning: 5,
      // 資格も重要
      licenses_expired: 10,
      // 財務系は抑制
      receivables_overdue: 4,
      contracts_decision_overdue: 5,
    },
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      // より厳しい判定
      severity_critical: 12,
      risk_critical: 40,
    },
  },
};

// ========== エクスポート ==========

export const PRESETS: AiVpPreset[] = [
  PRESET_BALANCED,
  PRESET_COMPLIANCE,
  PRESET_OPERATIONS,
  PRESET_FINANCE,
  PRESET_SAFETY,
];

/**
 * プリセットIDからプリセットを取得
 */
export function getPresetById(id: string): AiVpPreset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * プリセットをデフォルト設定にマージして完全な設定を生成
 */
export function mergePresetWithDefaults(preset: AiVpPreset): AiVpConfig {
  return {
    weights: {
      ...DEFAULT_WEIGHTS,
      ...preset.config.weights,
    } as AiVpWeights,
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...preset.config.thresholds,
    } as AiVpThresholds,
    diversity: {
      ...DEFAULT_DIVERSITY,
      ...preset.config.diversity,
    } as AiVpDiversity,
  };
}

/**
 * プリセット一覧を取得（API用）
 */
export function listPresets(): Array<{
  id: string;
  name: string;
  description: string;
  scenario: string;
}> {
  return PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    scenario: p.scenario,
  }));
}
