/**
 * オンボーディング 型定義
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 *
 * staffユーザーは、必須文書の電子署名が完了するまで業務画面に入れない
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
 */
export interface OnboardingRequirement {
  id: string;
  scopeType: OnboardingRequirementScopeType;
  scopeValue: string | null;  // orgUnitId または role名（globalの場合はnull）
  requiredDocs: RequiredDocItem[];
  isActive: boolean;
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
 */
export interface UserOnboarding {
  id: string;
  userId: string;
  status: UserOnboardingStatus;
  requiredItems: UserRequiredItem[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ========== リクエスト型 ==========

export interface CreateOnboardingRequirementRequest {
  scopeType: OnboardingRequirementScopeType;
  scopeValue?: string | null;
  requiredDocs: RequiredDocItem[];
  isActive?: boolean;
}

export interface UpdateOnboardingRequirementRequest {
  requiredDocs?: RequiredDocItem[];
  isActive?: boolean;
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
