/**
 * 契約管理（Contracts）型定義
 *
 * Task 049: 事業別財務集計のための契約管理
 * 契約の期限管理、更新判断期限、リスクレベル管理
 */

// ユーザーロール
export type UserRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

// ========== 契約本体 ==========

/** 契約タイプ */
export type ContractType =
  | 'service'       // サービス利用契約
  | 'lease'         // 賃貸借契約
  | 'maintenance'   // 保守契約
  | 'vendor'        // 委託契約
  | 'employment'    // 雇用契約
  | 'other';        // その他

/** 契約ステータス */
export type ContractStatus =
  | 'draft'         // 下書き
  | 'pending'       // 承認待ち
  | 'active'        // 有効
  | 'expiring'      // 期限間近
  | 'expired'       // 期限切れ
  | 'renewed'       // 更新済み
  | 'terminated';   // 解約

/** リスクレベル */
export type ContractRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** 自動更新タイプ */
export type AutoRenewalType = 'none' | 'auto' | 'manual';

/** 契約レコード */
export interface Contract {
  id: string;

  // 事業単位（Task 049）
  businessUnitId: string | null;

  // 契約基本情報
  contractNo: string | null;
  name: string;
  type: ContractType;
  description: string | null;

  // 契約相手
  counterpartyName: string;
  counterpartyId: string | null;  // resident/company/vendor ID

  // 金額情報
  amount: number | null;
  currency: string;
  paymentTerms: string | null;

  // 日付情報
  startAt: string;
  endAt: string;
  renewalDecisionDueAt: string | null;  // 更新判断期限

  // ステータス・リスク
  status: ContractStatus;
  riskLevel: ContractRiskLevel;
  riskNote: string | null;

  // 更新設定
  autoRenewal: AutoRenewalType;
  renewalTermMonths: number | null;

  // 担当情報
  ownerUserId: string | null;
  ownerName: string | null;

  // 関連ドキュメント
  documentIds: string[];

  // 監査
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

// ========== 監査ログ ==========

/** 監査アクション */
export type ContractEventAction =
  | 'create'
  | 'update'
  | 'renew'
  | 'terminate'
  | 'status_change'
  | 'risk_change';

/** 監査イベント */
export interface ContractEvent {
  id: string;
  contractId: string;
  actorUserId: string;
  action: ContractEventAction;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
  note: string | null;
}

// ========== ビューアーコンテキスト ==========

export interface ViewerContext {
  userId: string;
  role: UserRole;
}

// ========== ラベル ==========

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  service: 'サービス利用契約',
  lease: '賃貸借契約',
  maintenance: '保守契約',
  vendor: '委託契約',
  employment: '雇用契約',
  other: 'その他',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: '下書き',
  pending: '承認待ち',
  active: '有効',
  expiring: '期限間近',
  expired: '期限切れ',
  renewed: '更新済み',
  terminated: '解約',
};

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  pending: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  expiring: 'bg-orange-100 text-orange-700',
  expired: 'bg-red-100 text-red-700',
  renewed: 'bg-blue-100 text-blue-700',
  terminated: 'bg-zinc-200 text-zinc-600',
};

export const RISK_LEVEL_LABELS: Record<ContractRiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '緊急',
};

export const RISK_LEVEL_COLORS: Record<ContractRiskLevel, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export const AUTO_RENEWAL_LABELS: Record<AutoRenewalType, string> = {
  none: 'なし',
  auto: '自動更新',
  manual: '手動更新',
};

// ========== RBAC ==========

/**
 * 契約を閲覧できるか
 * - manager以上: 全件閲覧可
 */
export function canViewContracts(role: UserRole): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(role);
}

/**
 * 契約を編集できるか
 */
export function canEditContracts(role: UserRole): boolean {
  return ['manager', 'executive', 'admin'].includes(role);
}

/**
 * 契約を作成できるか
 */
export function canCreateContracts(role: UserRole): boolean {
  return ['manager', 'executive', 'admin'].includes(role);
}

/**
 * 統計を閲覧できるか
 */
export function canViewStats(role: UserRole): boolean {
  return ['manager', 'executive', 'admin', 'auditor'].includes(role);
}

// ========== ユーティリティ ==========

/**
 * 契約が期限間近かどうか
 */
export function isExpiringSoon(contract: Contract, warnDays: number = 30): boolean {
  if (['expired', 'terminated', 'renewed'].includes(contract.status)) {
    return false;
  }
  const today = new Date();
  const endDate = new Date(contract.endAt);
  const daysUntilEnd = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilEnd > 0 && daysUntilEnd <= warnDays;
}

/**
 * 契約が期限切れかどうか
 */
export function isExpired(contract: Contract): boolean {
  if (['terminated', 'renewed'].includes(contract.status)) {
    return false;
  }
  const today = new Date().toISOString().split('T')[0];
  return contract.endAt < today;
}

/**
 * 更新判断期限を超過しているか
 */
export function isDecisionOverdue(contract: Contract): boolean {
  if (!contract.renewalDecisionDueAt) return false;
  if (['expired', 'terminated', 'renewed'].includes(contract.status)) {
    return false;
  }
  const today = new Date().toISOString().split('T')[0];
  return contract.renewalDecisionDueAt < today;
}

/**
 * 終了までの日数を計算
 */
export function daysUntilEnd(contract: Contract): number {
  const today = new Date();
  const endDate = new Date(contract.endAt);
  return Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 更新判断期限までの日数を計算
 */
export function daysUntilDecision(contract: Contract): number | null {
  if (!contract.renewalDecisionDueAt) return null;
  const today = new Date();
  const decisionDate = new Date(contract.renewalDecisionDueAt);
  return Math.ceil((decisionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
