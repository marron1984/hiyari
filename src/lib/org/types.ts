/**
 * 組織ツリー（Org Tree）型定義
 *
 * 組織単位・所属・責任者・監査ログ
 */

// ========== 権限コンテキスト ==========

export type UserRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

export interface ViewerContext {
  userId: string;
  role: UserRole;
}

// ========== 組織種別 ==========

export type OrgUnitType = 'corp' | 'business' | 'site' | 'dept' | 'team' | 'other';

export const ORG_UNIT_TYPE_LABELS: Record<OrgUnitType, string> = {
  corp: '法人',
  business: '事業',
  site: '拠点',
  dept: '部署',
  team: 'チーム',
  other: 'その他',
};

export const ORG_UNIT_TYPE_CONFIG: Record<
  OrgUnitType,
  { label: string; icon: string; color: string; bgColor: string }
> = {
  corp: { label: '法人', icon: 'Building2', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  business: { label: '事業', icon: 'Briefcase', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  site: { label: '拠点', icon: 'MapPin', color: 'text-green-700', bgColor: 'bg-green-50' },
  dept: { label: '部署', icon: 'Users', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  team: { label: 'チーム', icon: 'UserCheck', color: 'text-cyan-700', bgColor: 'bg-cyan-50' },
  other: { label: 'その他', icon: 'MoreHorizontal', color: 'text-zinc-600', bgColor: 'bg-zinc-50' },
};

// ========== 組織単位 ==========

export interface OrgUnit {
  id: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgUnitWithChildren extends OrgUnit {
  children: OrgUnitWithChildren[];
}

// ========== 所属ロール ==========

export type RoleInOrg = 'member' | 'leader' | 'manager' | 'executive' | 'other';

export const ROLE_IN_ORG_LABELS: Record<RoleInOrg, string> = {
  member: 'メンバー',
  leader: 'リーダー',
  manager: '管理者',
  executive: '責任者',
  other: 'その他',
};

// ========== ユーザー所属 ==========

export interface UserOrgMembership {
  id: string;
  userId: string;
  userName: string | null;      // 表示用
  orgUnitId: string;
  orgUnitName: string | null;   // 表示用
  roleInOrg: RoleInOrg;
  isPrimary: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ========== 組織責任者 ==========

export type OrgManagerType = 'manager' | 'approver' | 'owner' | 'other';

export const ORG_MANAGER_TYPE_LABELS: Record<OrgManagerType, string> = {
  manager: '管理者',
  approver: '承認者',
  owner: 'オーナー',
  other: 'その他',
};

export interface OrgManager {
  id: string;
  orgUnitId: string;
  userId: string;
  userName: string | null;      // 表示用
  type: OrgManagerType;
  createdAt: string;
}

// ========== 監査ログ ==========

export type OrgEventAction =
  | 'create'
  | 'update'
  | 'move'
  | 'deactivate'
  | 'reactivate'
  | 'assign_user'
  | 'remove_user'
  | 'set_primary'
  | 'assign_manager'
  | 'remove_manager';

export type OrgEventEntityType = 'org_unit' | 'membership' | 'manager';

export interface OrgEvent {
  id: string;
  entityType: OrgEventEntityType;
  entityId: string;
  actorUserId: string;
  action: OrgEventAction;
  beforeJson: string | null;
  afterJson: string | null;
  note: string | null;
  createdAt: string;
}

// ========== ユーザー組織コンテキスト ==========

export interface UserOrgContext {
  userId: string;
  primaryOrgUnitId: string | null;
  primaryOrgUnit: OrgUnit | null;
  orgUnitIds: string[];
  memberships: UserOrgMembership[];
  managerOfOrgUnitIds: string[];
}

// ========== 入力型 ==========

export interface CreateOrgUnitInput {
  name: string;
  type: OrgUnitType;
  parentId?: string | null;
  sortOrder?: number;
  description?: string | null;
}

export interface UpdateOrgUnitInput {
  name?: string;
  type?: OrgUnitType;
  sortOrder?: number;
  description?: string | null;
  isActive?: boolean;
}

export interface AddMemberInput {
  userId: string;
  roleInOrg?: RoleInOrg;
  isPrimary?: boolean;
  startAt?: string | null;
  endAt?: string | null;
}

export interface UpdateMembershipInput {
  roleInOrg?: RoleInOrg;
  isPrimary?: boolean;
  startAt?: string | null;
  endAt?: string | null;
}

// ========== RBAC ==========

/**
 * 組織ツリーの閲覧が可能か
 */
export function canViewOrgTree(role: UserRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * 自分の所属のみ閲覧可能か（staff/leader）
 */
export function canViewOwnOrg(role: UserRole): boolean {
  return ['staff', 'leader', 'manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * 組織の編集が可能か
 */
export function canEditOrg(role: UserRole): boolean {
  return ['admin', 'executive'].includes(role);
}

/**
 * メンバーシップの編集が可能か
 */
export function canEditMembership(role: UserRole): boolean {
  return ['admin', 'executive'].includes(role);
}
