/**
 * ユーザースコープ（User Scope）
 *
 * 組織所属に基づくデータアクセス範囲を定義
 * 将来的には各ドメインのリポジトリで活用
 */

import * as orgRepo from '@/lib/org/repo';
import type { OrgUnit, UserOrgContext } from '@/lib/org/types';

// ========== スコープ型定義 ==========

/**
 * スコープモード
 * - own: 自分のみ
 * - org: 自組織のみ
 * - org_tree: 自組織およびその配下
 * - all: 全て
 */
export type ScopeMode = 'own' | 'org' | 'org_tree' | 'all';

/**
 * ユーザースコープ
 */
export interface UserScope {
  userId: string;
  mode: ScopeMode;
  orgUnitIds: string[];           // 直接所属している組織ID
  visibleOrgUnitIds: string[];    // 閲覧可能な組織ID（配下含む）
  primaryOrgUnitId: string | null;
  isManager: boolean;             // いずれかの組織の責任者か
  managerOfOrgUnitIds: string[];  // 責任者として管理する組織ID
}

// ========== スコープ計算 ==========

/**
 * 配下の組織IDを再帰的に取得
 */
function getDescendantOrgUnitIds(orgUnitId: string): string[] {
  const tree = orgRepo.getTree({ includeInactive: false });
  const result: string[] = [];

  function findAndCollect(nodes: typeof tree, parentId: string | null): boolean {
    for (const node of nodes) {
      if (node.id === orgUnitId) {
        // 対象を見つけた場合、配下を全て収集
        collectDescendants(node.children);
        return true;
      }
      if (findAndCollect(node.children, node.id)) {
        return true;
      }
    }
    return false;
  }

  function collectDescendants(nodes: typeof tree): void {
    for (const node of nodes) {
      result.push(node.id);
      collectDescendants(node.children);
    }
  }

  findAndCollect(tree, null);
  return result;
}

/**
 * ユーザーのスコープを計算
 */
export function computeUserScope(
  userId: string,
  mode: ScopeMode = 'org'
): UserScope {
  const context = orgRepo.getUserOrgContext(userId);

  const orgUnitIds = context.orgUnitIds;
  let visibleOrgUnitIds: string[] = [];

  switch (mode) {
    case 'own':
      // 自分のみ（組織は関係なし）
      visibleOrgUnitIds = [];
      break;

    case 'org':
      // 自分が所属する組織のみ
      visibleOrgUnitIds = [...orgUnitIds];
      break;

    case 'org_tree':
      // 自分が所属する組織および配下
      visibleOrgUnitIds = [...orgUnitIds];
      for (const orgId of orgUnitIds) {
        const descendants = getDescendantOrgUnitIds(orgId);
        for (const id of descendants) {
          if (!visibleOrgUnitIds.includes(id)) {
            visibleOrgUnitIds.push(id);
          }
        }
      }
      break;

    case 'all':
      // 全組織
      const allUnits = orgRepo.listOrgUnits({ includeInactive: false });
      visibleOrgUnitIds = allUnits.map((u) => u.id);
      break;
  }

  return {
    userId,
    mode,
    orgUnitIds,
    visibleOrgUnitIds,
    primaryOrgUnitId: context.primaryOrgUnitId,
    isManager: context.managerOfOrgUnitIds.length > 0,
    managerOfOrgUnitIds: context.managerOfOrgUnitIds,
  };
}

/**
 * 特定の組織がスコープ内にあるかチェック
 */
export function isOrgInScope(scope: UserScope, orgUnitId: string): boolean {
  if (scope.mode === 'all') return true;
  if (scope.mode === 'own') return false;
  return scope.visibleOrgUnitIds.includes(orgUnitId);
}

/**
 * スコープ内の組織IDリストを取得
 */
export function getOrgIdsInScope(scope: UserScope): string[] {
  if (scope.mode === 'own') return [];
  return scope.visibleOrgUnitIds;
}

/**
 * ユーザーが管理者として管轄する組織かチェック
 */
export function isManagerOf(scope: UserScope, orgUnitId: string): boolean {
  return scope.managerOfOrgUnitIds.includes(orgUnitId);
}

// ========== ロールベースのデフォルトスコープ ==========

/**
 * ロールに応じたデフォルトのスコープモードを取得
 */
export function getDefaultScopeMode(
  role: 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor'
): ScopeMode {
  switch (role) {
    case 'staff':
      return 'own';
    case 'leader':
      return 'org';
    case 'manager':
      return 'org_tree';
    case 'admin':
    case 'executive':
    case 'auditor':
      return 'all';
    default:
      return 'own';
  }
}

/**
 * ユーザーのロールに基づいてスコープを計算
 */
export function computeScopeForRole(
  userId: string,
  role: 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor'
): UserScope {
  const mode = getDefaultScopeMode(role);
  return computeUserScope(userId, mode);
}
