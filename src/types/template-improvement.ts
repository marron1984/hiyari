// ======== 仕訳テンプレート改善提案 型定義 ========

import type { AccountingTemplate, TemplateMatchCondition, JournalEntryDetail, DescriptionTemplate } from './accounting-template';

// ======== テンプレート利用統計 ========
export interface TemplateStats {
  templateId: string;
  tenantId: string;

  // 利用回数
  usageCount: number;

  // AIレビュー回数（異常検知された回数）
  aiReviewCount: number;

  // 人が修正を採用した回数
  humanCorrectionCount: number;

  // 金額外れ値検知回数
  amountOutlierCount: number;

  // 勘定科目変更検知回数
  accountItemChangeCount: number;

  // 最近の利用（直近10件の詳細）
  recentUsages: Array<{
    applicationId: string;
    paymentId?: string;
    date: string;
    amount: number;
    payeeName: string;
    hadAnomaly: boolean;
    humanCorrected: boolean;
    correctedAccountItemId?: number;
    correctedAccountItemName?: string;
  }>;

  // 集計期間
  periodStart: Date;
  periodEnd: Date;

  // 更新日時
  updatedAt: Date;
}

// ======== 改善トリガー条件 ========
export interface ImprovementTrigger {
  // AIレビュー回数閾値
  aiReviewThreshold: number;      // デフォルト: 3

  // 人による修正採用回数閾値
  humanCorrectionThreshold: number; // デフォルト: 2

  // 金額外れ値継続回数閾値
  amountOutlierThreshold: number;   // デフォルト: 3
}

// デフォルトトリガー条件
export const DEFAULT_IMPROVEMENT_TRIGGER: ImprovementTrigger = {
  aiReviewThreshold: 3,
  humanCorrectionThreshold: 2,
  amountOutlierThreshold: 3,
};

// ======== 改善提案の差分 ========
export interface TemplateDiff {
  // 名前の変更
  name?: {
    before: string;
    after: string;
  };

  // マッチング条件の変更
  matchCondition?: {
    before: TemplateMatchCondition;
    after: TemplateMatchCondition;
    changes: string[]; // 変更内容の説明
  };

  // 仕訳明細の変更
  entries?: {
    before: JournalEntryDetail[];
    after: JournalEntryDetail[];
    changes: string[];
  };

  // 摘要テンプレートの変更
  descriptionTemplate?: {
    before: DescriptionTemplate;
    after: DescriptionTemplate;
  };

  // 優先度の変更
  priority?: {
    before: number;
    after: number;
  };
}

// ======== 改善提案 ========
export interface TemplateSuggestion {
  id: string;
  tenantId: string;
  templateId: string;

  // 元テンプレート情報（スナップショット）
  originalTemplate: {
    name: string;
    matchCondition: TemplateMatchCondition;
    entries: JournalEntryDetail[];
    descriptionTemplate: DescriptionTemplate;
    priority: number;
  };

  // トリガー情報
  triggerReason: 'ai_review_count' | 'human_correction_count' | 'amount_outlier_count' | 'multiple';
  triggerDetails: {
    aiReviewCount?: number;
    humanCorrectionCount?: number;
    amountOutlierCount?: number;
  };

  // 統計情報（生成時点）
  stats: {
    usageCount: number;
    aiReviewCount: number;
    humanCorrectionCount: number;
    amountOutlierCount: number;
  };

  // AI分析結果
  aiAnalysis: {
    reason: string;           // 改善理由（自然文）
    diff: TemplateDiff;       // 差分案（JSON）
    confidence: number;       // 確信度 0-100
    model: string;            // 使用モデル
    tokensUsed: number;       // トークン消費量
  };

  // ステータス
  status: 'pending' | 'accepted' | 'rejected' | 'expired';

  // 承認者情報（採用/見送り時）
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Date;
  reviewNote?: string;

  // タイムスタンプ
  createdAt: Date;
  expiresAt: Date;            // 有効期限（30日後）
}

// ======== AI入力 ========
export interface TemplateImprovementAIInput {
  // テンプレート定義
  template: {
    id: string;
    name: string;
    description?: string;
    matchCondition: TemplateMatchCondition;
    entries: JournalEntryDetail[];
    descriptionTemplate: DescriptionTemplate;
    priority: number;
  };

  // 利用統計
  stats: {
    usageCount: number;
    aiReviewCount: number;
    humanCorrectionCount: number;
    amountOutlierCount: number;
    accountItemChangeCount: number;
  };

  // 最近の実例（最大10件）
  recentUsages: Array<{
    date: string;
    amount: number;
    payeeName: string;
    purpose?: string;
    hadAnomaly: boolean;
    anomalyType?: string;
    humanCorrected: boolean;
    correctedAccountItemName?: string;
  }>;

  // トリガー理由
  triggerReason: string;
}

// ======== AI出力 ========
export interface TemplateImprovementAIOutput {
  reason: string;             // 改善理由（自然文）
  diff: TemplateDiff;         // 差分案（JSON）
  confidence: number;         // 確信度 0-100
}

// ======== 定数 ========
export const TEMPLATE_STATS_COLLECTION = 'template_stats';
export const TEMPLATE_SUGGESTIONS_COLLECTION = 'accounting_template_suggestions';

// 提案の有効期限（日数）
export const SUGGESTION_EXPIRY_DAYS = 30;

// 統計集計期間（日数）
export const STATS_PERIOD_DAYS = 90;
