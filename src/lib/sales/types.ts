/**
 * leadScore 提案 型定義
 *
 * Ticket 124: leadScore 重み自動提案（ルールベース）
 */

import type { AiVpConfig } from '@/lib/aiVp/defaultConfig';
import type { SalesResultCode } from '@/lib/tickets/types';

// ======== 集計指標 ========

/** 結果コード別の集計 */
export interface ResultCodeDistribution {
  code: SalesResultCode;
  count: number;
  percentage: number;
}

/** ステージ進展率 */
export interface StageProgressionRate {
  /** ステージ名 */
  stage: string;
  /** 対象チケット数 */
  total: number;
  /** 進展した数 */
  progressed: number;
  /** 進展率 */
  rate: number;
}

/** ref（紹介元）別の成功率 */
export interface RefSuccessRate {
  ref: string;
  total: number;
  accepted: number;
  rate: number;
}

/** businessUnit別の成功率 */
export interface BusinessUnitSuccessRate {
  businessUnitId: string;
  total: number;
  accepted: number;
  rate: number;
}

/** 集計結果 */
export interface SalesMetricsAggregation {
  rangeDays: number;
  totalTickets: number;
  resultDistribution: ResultCodeDistribution[];
  stageProgression: StageProgressionRate[];
  refSuccessRates: RefSuccessRate[];
  businessUnitSuccessRates: BusinessUnitSuccessRate[];
  slaBreachCount: number;
  slaBreachRate: number;
}

// ======== 提案 ========

export type SuggestionConfidence = 'low' | 'medium' | 'high';

/** 個別の提案項目 */
export interface LeadScoreSuggestionItem {
  /** 提案識別キー */
  key: string;
  /** 提案タイトル */
  title: string;
  /** 根拠の説明 */
  rationale: string;
  /** 設定変更のパッチ（AiVpConfigの部分） */
  suggestedConfigPatch: Partial<AiVpConfig>;
  /** 確信度 */
  confidence: SuggestionConfidence;
}

export type SuggestionStatus = 'open' | 'accepted' | 'dismissed';

/** 提案ドキュメント（Firestoreモデル） */
export interface LeadScoreSuggestion {
  id: string;
  generatedAt: string;
  rangeDays: number;
  metrics: SalesMetricsAggregation;
  suggestions: LeadScoreSuggestionItem[];
  status: SuggestionStatus;
  actedByUserId: string | null;
  actedAt: string | null;
}
