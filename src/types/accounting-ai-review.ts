// ======== 勘定科目AIレビュー 型定義 ========

import type { AccountItem, AccountingTemplate } from './accounting-template';

// ======== 異常フラグ ========
export interface AnomalyFlags {
  // 勘定科目変更（過去の取引と異なる科目）
  accountItemChanged: boolean;
  accountItemChangedReason?: string;

  // 金額外れ値（過去の取引と比較して異常）
  amountOutlier: boolean;
  amountOutlierReason?: string;

  // 税区分不一致
  taxCodeMismatch: boolean;
  taxCodeMismatchReason?: string;

  // 支払種別不整合（取引先の通常支払方法と異なる）
  paymentMethodMismatch: boolean;
  paymentMethodMismatchReason?: string;
}

// ======== AI代替案 ========
export interface AIAlternative {
  accountItem: AccountItem;
  reason: string;
  confidence: number; // 0-100
}

// ======== AIレビュー結果 ========
export interface AccountingAIReview {
  id: string;
  tenantId: string;
  paymentId: string;
  applicationId: string;

  // テンプレートマッチ結果
  templateId: string;
  templateName: string;
  matchedAccountItem: AccountItem;

  // 異常フラグ
  anomalyFlags: AnomalyFlags;
  hasAnomaly: boolean;

  // AI分析結果（異常時のみ）
  aiAnalysis?: {
    reason: string;               // 違和感の理由（自然文）
    alternatives: AIAlternative[]; // 代替案（最大2つ）
    suggestedAction: 'proceed' | 'review' | 'change';
  };

  // AI呼び出し情報
  aiCalled: boolean;
  aiModel?: string;
  aiTokensUsed?: number;
  aiError?: string;

  // 承認者の判断
  reviewerDecision?: 'accepted' | 'changed' | 'ignored';
  reviewerSelectedAccountItemId?: number;
  reviewerNote?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Date;

  // タイムスタンプ
  createdAt: Date;
  updatedAt: Date;
}

// ======== AIチェック入力 ========
export interface AICheckInput {
  // 支払い情報
  paymentId: string;
  applicationId: string;
  payeeName: string;
  amount: number;
  paymentMethod: string;
  purpose?: string;
  description?: string;
  invoiceNumber?: string;

  // マッチしたテンプレート
  template: {
    id: string;
    name: string;
    accountItem: AccountItem;
    taxCode?: number;
  };

  // 過去の取引履歴（同一取引先）
  historicalTransactions?: Array<{
    date: string;
    amount: number;
    accountItemId: number;
    accountItemName: string;
  }>;
}

// ======== AIチェック結果 ========
export interface AICheckResult {
  success: boolean;
  anomalyFlags: AnomalyFlags;
  hasAnomaly: boolean;

  // AI分析結果（異常時のみ）
  aiAnalysis?: {
    reason: string;
    alternatives: AIAlternative[];
    suggestedAction: 'proceed' | 'review' | 'change';
  };

  // エラー情報
  error?: string;
}

// ======== 定数 ========
export const ACCOUNTING_AI_REVIEWS_COLLECTION = 'accounting_ai_reviews';

// 金額外れ値の閾値（標準偏差の倍数）
export const AMOUNT_OUTLIER_THRESHOLD = 2.0;

// 過去取引の参照期間（日数）
export const HISTORICAL_TRANSACTION_DAYS = 365;
