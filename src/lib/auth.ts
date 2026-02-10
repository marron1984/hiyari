// ======== 認証・権限チェックユーティリティ ========

import { UserRole, ROLE_LEVELS, ModulePermissions } from '@/types';

/**
 * ロールが指定レベル以上かチェック
 */
export function hasMinRole(userRole: UserRole | undefined, minRole: UserRole): boolean {
  if (!userRole) return false;
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[minRole];
}

/**
 * 承認権限があるかチェック（残業申請・稟議）
 * - leader: 自事業所のみ承認可能
 * - admin/system_admin: 全事業所承認可能
 */
export function canApprove(
  userRole: UserRole | undefined,
  userBranchId: string | undefined,
  targetBranchId: string
): boolean {
  if (!userRole) return false;

  // admin以上は全件承認可能
  if (hasMinRole(userRole, 'admin')) {
    return true;
  }

  // leaderは自事業所のみ
  if (userRole === 'leader' && userBranchId === targetBranchId) {
    return true;
  }

  return false;
}

/**
 * 管理者画面にアクセス可能かチェック
 */
export function canAccessAdmin(userRole: UserRole | undefined): boolean {
  return hasMinRole(userRole, 'leader');
}

/**
 * システム設定を変更可能かチェック
 */
export function canManageSettings(userRole: UserRole | undefined): boolean {
  return hasMinRole(userRole, 'admin');
}

/**
 * ユーザー管理が可能かチェック
 */
export function canManageUsers(userRole: UserRole | undefined): boolean {
  return hasMinRole(userRole, 'admin');
}

/**
 * ポイント手動調整が可能かチェック
 */
export function canAdjustPoints(userRole: UserRole | undefined): boolean {
  return hasMinRole(userRole, 'admin');
}

/**
 * ロール表示名
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'スタッフ',
  leader: 'リーダー',
  admin: '管理者',
  system_admin: 'システム管理者',
};

/**
 * 選択可能なロール一覧（ユーザー管理用）
 */
export const ASSIGNABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'user', label: 'スタッフ' },
  { value: 'leader', label: 'リーダー' },
  { value: 'admin', label: '管理者' },
];

// ======== モジュール別権限チェック ========

/**
 * 入居希望者の編集権限があるかチェック
 * - leader以上のロールは常に編集可能
 * - modulePermissions.prospects.canEdit が true のユーザーも編集可能
 */
export function canEditProspects(
  userRole: UserRole | undefined,
  modulePermissions?: ModulePermissions
): boolean {
  if (hasMinRole(userRole, 'leader')) return true;
  return modulePermissions?.prospects?.canEdit === true;
}

// ======== CHAOS 経営OS 権限 ========

/**
 * CHAOS exec権限者のメールアドレス（全社データ閲覧可能）
 */
export const CHAOS_EXEC_EMAILS = [
  'yoshida@aska-g.com',
];

/**
 * CHAOSデータの閲覧権限レベル
 */
export type ChaosViewLevel = 'self' | 'team' | 'all';

/**
 * CHAOSデータの閲覧権限を判定
 * - staff: 自分のみ (self)
 * - leader/manager: 配下のみ (team)
 * - admin/system_admin または exec指定者: 全社 (all)
 */
export function getChaosViewLevel(
  userRole: UserRole | undefined,
  userEmail?: string
): ChaosViewLevel {
  // exec権限者は全社
  if (userEmail && CHAOS_EXEC_EMAILS.includes(userEmail)) {
    return 'all';
  }

  // admin以上は全社
  if (hasMinRole(userRole, 'admin')) {
    return 'all';
  }

  // leaderは配下
  if (userRole === 'leader') {
    return 'team';
  }

  // それ以外は自分のみ
  return 'self';
}

/**
 * CHAOS全社データを閲覧可能か
 */
export function canViewAllChaosData(userRole: UserRole | undefined, userEmail?: string): boolean {
  return getChaosViewLevel(userRole, userEmail) === 'all';
}

/**
 * CHAOSチームデータを閲覧可能か
 */
export function canViewTeamChaosData(userRole: UserRole | undefined, userEmail?: string): boolean {
  const level = getChaosViewLevel(userRole, userEmail);
  return level === 'team' || level === 'all';
}

// ======== AI副社長 専用権限 ========

/**
 * AI副社長オーナーのメールアドレス
 */
export const AI_VP_OWNER_EMAIL = 'yoshida@aska-g.com';

/**
 * AI副社長オーナーかどうかをチェック
 * URLを知っていても、吉田以外はアクセス不可
 */
export function isAiVpOwner(email?: string): boolean {
  return email === AI_VP_OWNER_EMAIL;
}

/**
 * AI副社長の監査者（閲覧のみ可能）かどうかをチェック
 * 現時点では吉田のみ。将来的に拡張可能
 */
export function isAiVpAuditor(email?: string): boolean {
  // 現時点ではオーナーのみ
  return isAiVpOwner(email);
}
