/**
 * オンボーディング 型定義
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 * Ticket 094: 文書改訂時の再オンボーディング
 *
 * staffユーザーは、必須文書の電子署名が完了するまで業務画面に入れない
 * 文書改訂時は自動的に未完了に戻り、新しい文書への署名が必要
 */

import type { AppRole } from '@/config/appRoles';

// ========== スコープ ==========

/**
 * オンボーディング要件のスコープタイプ
 */
export type OnboardingRequirementScopeType = 'global' | 'orgUnit' | 'role';

// ========== 必須文書 ==========

/**
 * 必須文書アイテム
 */
export interface RequiredDocItem {
  documentId: string;
  documentVersionId: string;
  title: string;
}

// ========== オンボーディング要件 ==========

/**
 * オンボーディング要件（管理者が設定）
 *
 * Ticket 094: requirementsVersion でバージョン管理を追加
 */
export interface OnboardingRequirement {
  id: string;
  scopeType: OnboardingRequirementScopeType;
  scopeValue: string | null;  // orgUnitId または role名（globalの場合はnull）
  requiredDocs: RequiredDocItem[];
  isActive: boolean;
  // Ticket 094: バージョン管理
  requirementsVersion: number;
  updatedByUserId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// ========== ユーザーオンボーディング ==========

/**
 * ユーザーの必須アイテム進捗
 */
export interface UserRequiredItem {
  documentVersionId: string;
  documentId: string;
  title: string;
  status: 'pending' | 'signed';
  signedAt?: string;
}

/**
 * ユーザーオンボーディングステータス
 */
export type UserOnboardingStatus = 'pending' | 'completed';

/**
 * ユーザーオンボーディング（ユーザーごとの進捗）
 *
 * Ticket 094: appliedRequirementsVersion で適用バージョンを保持
 */
export interface UserOnboarding {
  id: string;
  userId: string;
  status: UserOnboardingStatus;
  requiredItems: UserRequiredItem[];
  // Ticket 094: 適用バージョン
  appliedRequirementsVersion: number;
  appliedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ========== オンボーディングイベント（監査ログ） ==========

/**
 * イベントアクション
 */
export type OnboardingEventAction =
  | 'requirement_applied'  // 要件バージョンを適用
  | 'reset_pending'        // pending に戻された
  | 'completed'            // 完了
  | 'signed'               // 署名完了
  | 'post_complete';       // Ticket 100: 完了後処理実行

/**
 * オンボーディングイベント（監査ログ）
 */
export interface OnboardingEvent {
  id: string;
  userId: string;
  action: OnboardingEventAction;
  fromVersion: number | null;
  toVersion: number | null;
  actorUserId: string | null;
  note: string | null;
  createdAt: string;
}

// ========== リクエスト型 ==========

export interface CreateOnboardingRequirementRequest {
  scopeType: OnboardingRequirementScopeType;
  scopeValue?: string | null;
  requiredDocs: RequiredDocItem[];
  isActive?: boolean;
  note?: string;
  actorUserId?: string;
}

export interface UpdateOnboardingRequirementRequest {
  requiredDocs?: RequiredDocItem[];
  isActive?: boolean;
  note?: string;
  actorUserId?: string;
}

// ========== 署名リクエスト ==========

export interface SignDocumentRequest {
  documentId: string;
  documentVersionId: string;
  subjectName: string;  // 署名者名（確認用）
}

// ========== RBAC ==========

/**
 * オンボーディング要件を管理できるか
 */
export function canManageOnboardingRequirements(role: AppRole): boolean {
  return ['admin', 'executive'].includes(role);
}

/**
 * オンボーディング対象のロールか
 * manager以上はオンボーディング免除
 */
export function isOnboardingTargetRole(role: AppRole): boolean {
  return ['staff', 'leader'].includes(role);
}

// ========== 設定値 ==========

export const ONBOARDING_STATUS_CONFIG: Record<UserOnboardingStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  pending: { label: '未完了', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  completed: { label: '完了', color: 'text-green-700', bgColor: 'bg-green-100' },
};

export const REQUIRED_ITEM_STATUS_CONFIG: Record<'pending' | 'signed', {
  label: string;
  color: string;
}> = {
  pending: { label: '未署名', color: 'text-amber-600' },
  signed: { label: '署名済', color: 'text-green-600' },
};
