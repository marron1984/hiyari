/**
 * ユーザースコープ（User Scope）
 *
 * 組織所属に基づくデータアクセス範囲を定義
 * Task 029 (Org Tree) + Task 030 (Business Scope Integration)
 */

import * as orgRepo from '@/lib/org/repo';
import type { UserRole } from '@/lib/org/types';

// ========== アプリケーションロール ==========

export type AppRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

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
 * 統一スコープ型 (Task 030)
 * 各ドメインリポジトリで共通して受け取る型
 */
export interface Scope {
  role: AppRole;
  userId: string;
  orgUnitIds: string[];           // 029 memberships からの組織ID
  primaryOrgUnitId?: string;
  businessUnitIds?: string[];     // 027 business_units との対応
  canViewFinance: boolean;        // 財務情報閲覧可否
  canViewPII: boolean;            // 個人情報閲覧可否
}

/**
 * ユーザースコープ（レガシー互換）
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

// ========== 組織→事業マッピング ==========

/**
 * 組織IDと事業単位IDのマッピング
 * 本番では DB から取得。現在は静的マッピング
 */
const ORG_TO_BUSINESS_MAP: Record<string, string[]> = {
  // 法人本部
  'org_corp': ['bu_corp'],
  // 訪問介護事業部 → 西淀川・東淀川
  'org_homecare': ['bu_001', 'bu_002'],
  // 西淀川拠点
  'org_nishi': ['bu_001'],
  'org_nishi_a': ['bu_001'],
  'org_nishi_b': ['bu_001'],
  // 東淀川拠点
  'org_higashi': ['bu_002'],
  // 施設事業部 → サ高住・老人ホーム
  'org_facility': ['bu_003', 'bu_004'],
  // サ高住さくら
  'org_sakura': ['bu_003'],
};

/**
 * 組織IDから関連する事業単位IDを取得
 */
export function getBusinessUnitIdsFromOrgIds(orgUnitIds: string[]): string[] {
  const businessIds = new Set<string>();
  for (const orgId of orgUnitIds) {
    const mapped = ORG_TO_BUSINESS_MAP[orgId];
    if (mapped) {
      mapped.forEach((id) => businessIds.add(id));
    }
  }
  return Array.from(businessIds);
}

// ========== 権限判定 ==========

/**
 * ロールが財務情報を閲覧可能かどうか
 */
export function canViewFinance(role: AppRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * ロールが個人情報(PII)を閲覧可能かどうか
 */
export function canViewPII(role: AppRole): boolean {
  // 基本的に全ロールがPII閲覧可能（介護業界特性）
  // 外部アカウントは別途制限
  return true;
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

// ========== 統一 Scope 生成 (Task 030) ==========

/**
 * ユーザーID・ロールから統一Scopeを生成
 * 各ドメインリポジトリがこの型を受け取ってフィルタに使う
 */
export function createScope(userId: string, role: AppRole): Scope {
  const userScope = computeScopeForRole(userId, role);
  const businessUnitIds = getBusinessUnitIdsFromOrgIds(userScope.visibleOrgUnitIds);

  return {
    role,
    userId,
    orgUnitIds: userScope.visibleOrgUnitIds,
    primaryOrgUnitId: userScope.primaryOrgUnitId ?? undefined,
    businessUnitIds: businessUnitIds.length > 0 ? businessUnitIds : undefined,
    canViewFinance: canViewFinance(role),
    canViewPII: canViewPII(role),
  };
}

/**
 * 全権限スコープを生成（admin/executive/auditor用）
 */
export function createFullScope(userId: string, role: AppRole = 'admin'): Scope {
  const allUnits = orgRepo.listOrgUnits({ includeInactive: false });
  const allOrgIds = allUnits.map((u) => u.id);
  const allBusinessIds = getBusinessUnitIdsFromOrgIds(allOrgIds);

  return {
    role,
    userId,
    orgUnitIds: allOrgIds,
    primaryOrgUnitId: undefined,
    businessUnitIds: allBusinessIds,
    canViewFinance: true,
    canViewPII: true,
  };
}

// ========== フィルタヘルパー ==========

/**
 * 事業単位IDがスコープ内にあるかチェック
 */
export function isBusinessUnitInScope(scope: Scope, businessUnitId: string): boolean {
  // adminなど全権限ロールは常にtrue
  if (['admin', 'executive', 'auditor'].includes(scope.role)) {
    return true;
  }
  // businessUnitIdsが未定義の場合は全て表示（移行期間中）
  if (!scope.businessUnitIds) {
    return true;
  }
  return scope.businessUnitIds.includes(businessUnitId);
}

/**
 * 組織IDがスコープ内にあるかチェック（Scope型用）
 */
export function isOrgUnitInScope(scope: Scope, orgUnitId: string): boolean {
  if (['admin', 'executive', 'auditor'].includes(scope.role)) {
    return true;
  }
  return scope.orgUnitIds.includes(orgUnitId);
}

/**
 * 配列から事業単位スコープでフィルタ
 * T は businessUnitId プロパティを持つ必要がある
 */
export function filterByBusinessScope<T extends { businessUnitId?: string | null }>(
  items: T[],
  scope: Scope
): T[] {
  if (['admin', 'executive', 'auditor'].includes(scope.role)) {
    return items;
  }
  if (!scope.businessUnitIds) {
    return items; // 移行期間中は全て表示
  }
  return items.filter((item) => {
    if (!item.businessUnitId) return true; // 紐付けなしは表示
    return scope.businessUnitIds!.includes(item.businessUnitId);
  });
}

/**
 * 配列から組織スコープでフィルタ
 * T は orgUnitId プロパティを持つ必要がある
 */
export function filterByOrgScope<T extends { orgUnitId?: string | null }>(
  items: T[],
  scope: Scope
): T[] {
  if (['admin', 'executive', 'auditor'].includes(scope.role)) {
    return items;
  }
  return items.filter((item) => {
    if (!item.orgUnitId) return true; // 紐付けなしは表示
    return scope.orgUnitIds.includes(item.orgUnitId);
  });
}

// ========== ドメインスコープ対応状況 ==========

/**
 * ドメインごとのスコープ対応状況
 * - 'scoped': businessUnitId/orgUnitId でフィルタ可能
 * - 'partial': 一部対応（手動紐付け必要）
 * - 'unscoped': 未対応（全体集計のみ）
 */
export type DomainScopeStatus = 'scoped' | 'partial' | 'unscoped';

export interface DomainCoverage {
  domain: string;
  label: string;
  status: DomainScopeStatus;
  note?: string;
}

/**
 * 各ドメインのスコープ対応状況
 * UI表示や監査ログ用
 * Task 030: tickets, repairs, correctiveActions, licenses を scoped に更新
 */
export const DOMAIN_SCOPE_COVERAGE: DomainCoverage[] = [
  { domain: 'alerts', label: 'アラート', status: 'scoped' },
  { domain: 'tickets', label: 'チケット', status: 'scoped', note: 'Task 030: businessUnitId対応' },
  { domain: 'repairs', label: '修繕', status: 'scoped', note: 'Task 030: businessUnitId対応' },
  { domain: 'complaints', label: 'クレーム', status: 'partial', note: 'residentId経由で間接対応' },
  { domain: 'correctiveActions', label: '是正措置', status: 'scoped', note: 'Task 030: businessUnitId対応' },
  { domain: 'training', label: '研修', status: 'partial', note: 'userId経由で間接対応' },
  { domain: 'licenses', label: '資格', status: 'scoped', note: 'Task 030: orgUnitIds対応（ユーザー所属ベース）' },
  { domain: 'receivables', label: '未収', status: 'partial', note: 'residentId経由で間接対応' },
  { domain: 'collection', label: '回収フロー', status: 'partial', note: 'receivableId経由で間接対応' },
  { domain: 'agreements', label: '同意書', status: 'partial', note: 'residentId経由で間接対応' },
];

/**
 * 特定ドメインのスコープ対応状況を取得
 */
export function getDomainCoverage(domain: string): DomainCoverage | undefined {
  return DOMAIN_SCOPE_COVERAGE.find((d) => d.domain === domain);
}

/**
 * スコープ未対応のドメイン一覧を取得
 */
export function getUnscopedDomains(): DomainCoverage[] {
  return DOMAIN_SCOPE_COVERAGE.filter((d) => d.status === 'unscoped');
}
