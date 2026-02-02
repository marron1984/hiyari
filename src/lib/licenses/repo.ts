/**
 * 資格管理（Licenses）リポジトリ
 *
 * インメモリストア実装
 * Task 030: orgUnitIds によるスコープ対応（user_org_memberships経由）
 */

import type {
  LicenseType,
  LicenseCategoryType,
  UserLicense,
  UserLicenseStatus,
  LicenseRenewalEvent,
  LicenseListFilters,
  LicenseListItem,
  LicenseStats,
  CreateUserLicenseRequest,
  UpdateUserLicenseRequest,
  RenewLicenseRequest,
  ViewerContext,
  Pagination,
} from './types';
import { canViewLicense, canManageLicense, canViewLicenseStats } from './types';

// ========== ストレージ ==========

const licenseTypesStore = new Map<string, LicenseType>();
const userLicensesStore = new Map<string, UserLicense>();
const renewalEventsStore = new Map<string, LicenseRenewalEvent>();

// ユーザー情報（user_org_memberships相当）
interface UserInfo {
  id: string;
  name: string | null;
  orgUnitId: string | null;  // primaryOrgUnitId
}
const usersStore = new Map<string, UserInfo>();

let licenseIdCounter = 1;
let renewalIdCounter = 1;

// ========== ユーティリティ ==========

function generateLicenseId(): string {
  return `ul_${String(licenseIdCounter++).padStart(4, '0')}`;
}

function generateRenewalId(): string {
  return `lre_${String(renewalIdCounter++).padStart(4, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * expiresAt から status を自動計算
 */
function calculateStatus(expiresAt: string | null): UserLicenseStatus {
  if (!expiresAt) return 'active';  // 無期限は active
  const expDate = new Date(expiresAt);
  const todayDate = new Date(today());
  if (expDate < todayDate) return 'expired';
  return 'active';
}

/**
 * 期限切れまでの日数を計算
 */
function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const expDate = new Date(expiresAt);
  const todayDate = new Date(today());
  return Math.ceil((expDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
}

// ========== 資格種別マスタ ==========

export function listLicenseTypes(): LicenseType[] {
  return Array.from(licenseTypesStore.values()).filter((lt) => lt.isActive);
}

export function getLicenseTypeById(id: string): LicenseType | null {
  return licenseTypesStore.get(id) ?? null;
}

// ========== 一覧取得 ==========

export function listLicenses(
  viewer: ViewerContext,
  filters: LicenseListFilters,
  pagination?: Pagination
): { items: LicenseListItem[]; total: number } {
  // staff/leader は myOnly 強制
  const effectiveFilters = { ...filters };
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    effectiveFilters.myOnly = true;
  }

  let items: LicenseListItem[] = [];

  for (const ul of userLicensesStore.values()) {
    const user = usersStore.get(ul.userId);
    if (!user) continue;

    const lt = licenseTypesStore.get(ul.licenseTypeId);
    if (!lt || !lt.isActive) continue;

    // RBAC / スコープチェック
    if (!canViewLicense(ul, user, viewer)) continue;

    // myOnly フィルタ
    if (effectiveFilters.myOnly && ul.userId !== viewer.userId) continue;

    // orgUnitIds フィルタ（manager以上）
    if (effectiveFilters.orgUnitIds && effectiveFilters.orgUnitIds.length > 0) {
      if (!user.orgUnitId || !effectiveFilters.orgUnitIds.includes(user.orgUnitId)) {
        continue;
      }
    }

    // userId フィルタ
    if (effectiveFilters.userId && ul.userId !== effectiveFilters.userId) continue;

    // status フィルタ
    const currentStatus = calculateStatus(ul.expiresAt);
    const effectiveStatus = ul.status === 'suspended' ? 'suspended' : currentStatus;
    if (effectiveFilters.status && effectiveFilters.status.length > 0) {
      if (!effectiveFilters.status.includes(effectiveStatus)) continue;
    }

    // licenseTypeId フィルタ
    if (effectiveFilters.licenseTypeId && ul.licenseTypeId !== effectiveFilters.licenseTypeId) continue;

    // category フィルタ
    if (effectiveFilters.category && lt.category !== effectiveFilters.category) continue;

    // expired フィルタ
    if (effectiveFilters.expired === true && effectiveStatus !== 'expired') continue;
    if (effectiveFilters.expired === false && effectiveStatus === 'expired') continue;

    // expiringWithinDays フィルタ
    if (effectiveFilters.expiringWithinDays !== undefined) {
      const days = daysUntilExpiry(ul.expiresAt);
      if (days === null || days < 0 || days > effectiveFilters.expiringWithinDays) continue;
    }

    // q 検索
    if (effectiveFilters.q) {
      const q = effectiveFilters.q.toLowerCase();
      const matchUser = user.name?.toLowerCase().includes(q);
      const matchLicense = lt.name.toLowerCase().includes(q);
      if (!matchUser && !matchLicense) continue;
    }

    items.push({
      userLicense: { ...ul, status: effectiveStatus },
      licenseType: {
        id: lt.id,
        name: lt.name,
        category: lt.category,
        requiresRenewal: lt.requiresRenewal,
        defaultWarnDays: lt.defaultWarnDays,
      },
      user: {
        id: user.id,
        name: user.name,
        orgUnitId: user.orgUnitId,
      },
    });
  }

  // ソート: expired/expiring優先 → expiresAt昇順
  items.sort((a, b) => {
    const statusOrder: Record<UserLicenseStatus, number> = {
      expired: 0,
      suspended: 1,
      active: 2,
      unknown: 3,
    };
    const statusDiff = statusOrder[a.userLicense.status] - statusOrder[b.userLicense.status];
    if (statusDiff !== 0) return statusDiff;

    const daysA = daysUntilExpiry(a.userLicense.expiresAt);
    const daysB = daysUntilExpiry(b.userLicense.expiresAt);
    if (daysA !== null && daysB !== null) {
      return daysA - daysB;
    }
    return 0;
  });

  const total = items.length;

  // ページネーション
  const limit = pagination?.limit ?? 50;
  const offset = pagination?.offset ?? 0;
  items = items.slice(offset, offset + limit);

  return { items, total };
}

// ========== 詳細取得 ==========

export function getById(
  id: string,
  viewer: ViewerContext
): { success: true; item: LicenseListItem } | { success: false; error: string } {
  const ul = userLicensesStore.get(id);
  if (!ul) {
    return { success: false, error: '資格が見つかりません' };
  }

  const user = usersStore.get(ul.userId);
  if (!user) {
    return { success: false, error: 'ユーザー情報が見つかりません' };
  }

  if (!canViewLicense(ul, user, viewer)) {
    return { success: false, error: '閲覧権限がありません' };
  }

  const lt = licenseTypesStore.get(ul.licenseTypeId);
  if (!lt) {
    return { success: false, error: '資格種別が見つかりません' };
  }

  const currentStatus = calculateStatus(ul.expiresAt);
  const effectiveStatus = ul.status === 'suspended' ? 'suspended' : currentStatus;

  return {
    success: true,
    item: {
      userLicense: { ...ul, status: effectiveStatus },
      licenseType: {
        id: lt.id,
        name: lt.name,
        category: lt.category,
        requiresRenewal: lt.requiresRenewal,
        defaultWarnDays: lt.defaultWarnDays,
      },
      user: {
        id: user.id,
        name: user.name,
        orgUnitId: user.orgUnitId,
      },
    },
  };
}

// ========== 作成 ==========

export function create(
  input: CreateUserLicenseRequest,
  actorUserId: string
): { success: true; item: UserLicense } | { success: false; error: string } {
  const lt = licenseTypesStore.get(input.licenseTypeId);
  if (!lt || !lt.isActive) {
    return { success: false, error: '無効な資格種別です' };
  }

  const user = usersStore.get(input.userId);
  if (!user) {
    return { success: false, error: 'ユーザーが見つかりません' };
  }

  const timestamp = now();
  const ul: UserLicense = {
    id: generateLicenseId(),
    userId: input.userId,
    licenseTypeId: input.licenseTypeId,
    licenseNumber: input.licenseNumber ?? null,
    issuedAt: input.issuedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    status: calculateStatus(input.expiresAt ?? null),
    notes: input.notes ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  userLicensesStore.set(ul.id, ul);
  return { success: true, item: ul };
}

// ========== 更新 ==========

export function update(
  id: string,
  patch: UpdateUserLicenseRequest,
  viewer: ViewerContext
): { success: true; item: UserLicense } | { success: false; error: string } {
  const ul = userLicensesStore.get(id);
  if (!ul) {
    return { success: false, error: '資格が見つかりません' };
  }

  if (!canManageLicense(viewer)) {
    return { success: false, error: '更新権限がありません' };
  }

  const updated: UserLicense = {
    ...ul,
    ...patch,
    status: patch.status ?? calculateStatus(patch.expiresAt ?? ul.expiresAt),
    updatedAt: now(),
  };

  userLicensesStore.set(id, updated);
  return { success: true, item: updated };
}

// ========== 更新 (renew) ==========

export function renew(
  id: string,
  input: RenewLicenseRequest,
  viewer: ViewerContext
): { success: true; item: UserLicense; event: LicenseRenewalEvent } | { success: false; error: string } {
  const ul = userLicensesStore.get(id);
  if (!ul) {
    return { success: false, error: '資格が見つかりません' };
  }

  if (!canManageLicense(viewer)) {
    return { success: false, error: '更新権限がありません' };
  }

  const oldExpiresAt = ul.expiresAt;
  const timestamp = now();

  // 更新イベント記録
  const event: LicenseRenewalEvent = {
    id: generateRenewalId(),
    userLicenseId: ul.id,
    oldExpiresAt,
    newExpiresAt: input.newExpiresAt,
    renewedAt: timestamp,
    actorUserId: viewer.userId,
    note: input.note ?? null,
    createdAt: timestamp,
  };
  renewalEventsStore.set(event.id, event);

  // 資格更新
  ul.expiresAt = input.newExpiresAt;
  ul.status = calculateStatus(input.newExpiresAt);
  ul.updatedAt = timestamp;

  return { success: true, item: ul, event };
}

// ========== 削除 ==========

export function remove(
  id: string,
  viewer: ViewerContext
): { success: true } | { success: false; error: string } {
  const ul = userLicensesStore.get(id);
  if (!ul) {
    return { success: false, error: '資格が見つかりません' };
  }

  if (!canManageLicense(viewer)) {
    return { success: false, error: '削除権限がありません' };
  }

  userLicensesStore.delete(id);
  return { success: true };
}

// ========== 統計 ==========

export interface LicenseStatsOptions {
  orgUnitIds?: string[];
}

export function getStats(
  viewer: ViewerContext,
  options?: LicenseStatsOptions
): LicenseStats | null {
  if (!canViewLicenseStats(viewer)) {
    return null;
  }

  let userLicenses = Array.from(userLicensesStore.values());

  // orgUnitIds スコープ
  if (options?.orgUnitIds && options.orgUnitIds.length > 0) {
    userLicenses = userLicenses.filter((ul) => {
      const user = usersStore.get(ul.userId);
      return user?.orgUnitId && options.orgUnitIds!.includes(user.orgUnitId);
    });
  }

  const stats: LicenseStats = {
    expired: 0,
    expiring30: 0,
    expiring90: 0,
    totalActive: 0,
  };

  const todayStr = today();

  for (const ul of userLicenses) {
    if (ul.status === 'suspended') continue;

    const currentStatus = calculateStatus(ul.expiresAt);
    const days = daysUntilExpiry(ul.expiresAt);

    if (currentStatus === 'expired') {
      stats.expired++;
    } else if (currentStatus === 'active') {
      stats.totalActive++;
      if (days !== null) {
        if (days <= 30) stats.expiring30++;
        if (days <= 90) stats.expiring90++;
      }
    }
  }

  return stats;
}

// ========== スキャン ==========

export function scanExpired(): LicenseListItem[] {
  const items: LicenseListItem[] = [];

  for (const ul of userLicensesStore.values()) {
    if (ul.status === 'suspended') continue;
    if (calculateStatus(ul.expiresAt) !== 'expired') continue;

    const user = usersStore.get(ul.userId);
    const lt = licenseTypesStore.get(ul.licenseTypeId);
    if (!user || !lt) continue;

    items.push({
      userLicense: { ...ul, status: 'expired' },
      licenseType: {
        id: lt.id,
        name: lt.name,
        category: lt.category,
        requiresRenewal: lt.requiresRenewal,
        defaultWarnDays: lt.defaultWarnDays,
      },
      user: {
        id: user.id,
        name: user.name,
        orgUnitId: user.orgUnitId,
      },
    });
  }

  return items;
}

export function scanExpiring(withinDays: number = 30): LicenseListItem[] {
  const items: LicenseListItem[] = [];

  for (const ul of userLicensesStore.values()) {
    if (ul.status === 'suspended') continue;

    const days = daysUntilExpiry(ul.expiresAt);
    if (days === null || days < 0 || days > withinDays) continue;

    const user = usersStore.get(ul.userId);
    const lt = licenseTypesStore.get(ul.licenseTypeId);
    if (!user || !lt) continue;

    items.push({
      userLicense: { ...ul, status: 'active' },
      licenseType: {
        id: lt.id,
        name: lt.name,
        category: lt.category,
        requiresRenewal: lt.requiresRenewal,
        defaultWarnDays: lt.defaultWarnDays,
      },
      user: {
        id: user.id,
        name: user.name,
        orgUnitId: user.orgUnitId,
      },
    });
  }

  return items;
}

// ========== ユーザーの資格一覧 ==========

export function getByUserId(userId: string): LicenseListItem[] {
  const items: LicenseListItem[] = [];
  const user = usersStore.get(userId);
  if (!user) return items;

  for (const ul of userLicensesStore.values()) {
    if (ul.userId !== userId) continue;

    const lt = licenseTypesStore.get(ul.licenseTypeId);
    if (!lt || !lt.isActive) continue;

    const currentStatus = calculateStatus(ul.expiresAt);
    const effectiveStatus = ul.status === 'suspended' ? 'suspended' : currentStatus;

    items.push({
      userLicense: { ...ul, status: effectiveStatus },
      licenseType: {
        id: lt.id,
        name: lt.name,
        category: lt.category,
        requiresRenewal: lt.requiresRenewal,
        defaultWarnDays: lt.defaultWarnDays,
      },
      user: {
        id: user.id,
        name: user.name,
        orgUnitId: user.orgUnitId,
      },
    });
  }

  return items;
}

// ========== 更新履歴 ==========

export function getRenewalHistory(userLicenseId: string): LicenseRenewalEvent[] {
  return Array.from(renewalEventsStore.values())
    .filter((e) => e.userLicenseId === userLicenseId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (licenseTypesStore.size > 0) return;

  const timestamp = now();

  // 資格種別マスタ
  const licenseTypes: LicenseType[] = [
    {
      id: 'lt_care_worker',
      name: '介護福祉士',
      category: 'care',
      requiresRenewal: false,
      defaultRenewalMonths: null,
      defaultWarnDays: null,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'lt_care_manager',
      name: '介護支援専門員',
      category: 'care',
      requiresRenewal: true,
      defaultRenewalMonths: 60,
      defaultWarnDays: 90,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'lt_helper2',
      name: 'ホームヘルパー2級',
      category: 'care',
      requiresRenewal: false,
      defaultRenewalMonths: null,
      defaultWarnDays: null,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'lt_rn',
      name: '正看護師',
      category: 'nursing',
      requiresRenewal: false,
      defaultRenewalMonths: null,
      defaultWarnDays: null,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'lt_lpn',
      name: '准看護師',
      category: 'nursing',
      requiresRenewal: false,
      defaultRenewalMonths: null,
      defaultWarnDays: null,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'lt_driver',
      name: '普通自動車免許',
      category: 'other',
      requiresRenewal: true,
      defaultRenewalMonths: 36,
      defaultWarnDays: 60,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'lt_first_aid',
      name: '救急救命講習修了',
      category: 'other',
      requiresRenewal: true,
      defaultRenewalMonths: 36,
      defaultWarnDays: 30,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  licenseTypes.forEach((lt) => licenseTypesStore.set(lt.id, lt));

  // ユーザー情報
  const users: UserInfo[] = [
    { id: 'user_001', name: '山田太郎', orgUnitId: 'org_nishi' },
    { id: 'user_002', name: '佐藤次郎', orgUnitId: 'org_nishi' },
    { id: 'user_003', name: '鈴木花子', orgUnitId: 'org_higashi' },
    { id: 'user_004', name: '高橋三郎', orgUnitId: 'org_sakura' },
    { id: 'user_005', name: '田中美咲', orgUnitId: 'org_sakura' },
  ];
  users.forEach((u) => usersStore.set(u.id, u));

  // 日付計算
  const nowDate = new Date();
  const oneYearAgo = new Date(nowDate.getTime() - 365 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twoWeeksLater = new Date(nowDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  const sixtyDaysLater = new Date(nowDate.getTime() + 60 * 24 * 60 * 60 * 1000);
  const oneYearLater = new Date(nowDate.getTime() + 365 * 24 * 60 * 60 * 1000);

  // ユーザー資格
  const userLicenses: Omit<UserLicense, 'id' | 'createdAt' | 'updatedAt' | 'status'>[] = [
    // user_001
    {
      userId: 'user_001',
      licenseTypeId: 'lt_care_worker',
      licenseNumber: 'CW-12345',
      issuedAt: oneYearAgo.toISOString().split('T')[0],
      expiresAt: null,
      notes: null,
    },
    {
      userId: 'user_001',
      licenseTypeId: 'lt_driver',
      licenseNumber: '012345678901',
      issuedAt: oneYearAgo.toISOString().split('T')[0],
      expiresAt: twoWeeksLater.toISOString().split('T')[0],  // 期限間近
      notes: '更新必要',
    },
    // user_002
    {
      userId: 'user_002',
      licenseTypeId: 'lt_helper2',
      licenseNumber: 'HH-54321',
      issuedAt: oneYearAgo.toISOString().split('T')[0],
      expiresAt: null,
      notes: null,
    },
    // user_003
    {
      userId: 'user_003',
      licenseTypeId: 'lt_care_manager',
      licenseNumber: 'CM-98765',
      issuedAt: oneYearAgo.toISOString().split('T')[0],
      expiresAt: thirtyDaysAgo.toISOString().split('T')[0],  // 期限切れ
      notes: '更新手続き中',
    },
    // user_004
    {
      userId: 'user_004',
      licenseTypeId: 'lt_rn',
      licenseNumber: 'RN-11111',
      issuedAt: oneYearAgo.toISOString().split('T')[0],
      expiresAt: null,
      notes: null,
    },
    {
      userId: 'user_004',
      licenseTypeId: 'lt_first_aid',
      licenseNumber: null,
      issuedAt: oneYearAgo.toISOString().split('T')[0],
      expiresAt: sixtyDaysLater.toISOString().split('T')[0],  // 60日後
      notes: null,
    },
    // user_005
    {
      userId: 'user_005',
      licenseTypeId: 'lt_lpn',
      licenseNumber: 'LPN-22222',
      issuedAt: oneYearAgo.toISOString().split('T')[0],
      expiresAt: null,
      notes: null,
    },
  ];

  userLicenses.forEach((ul) => {
    const license: UserLicense = {
      ...ul,
      id: generateLicenseId(),
      status: calculateStatus(ul.expiresAt),
      createdAt: oneYearAgo.toISOString(),
      updatedAt: timestamp,
    };
    userLicensesStore.set(license.id, license);
  });
}

initDemoData();
