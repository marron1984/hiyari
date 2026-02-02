/**
 * 資格管理（Licenses）リポジトリ
 *
 * インメモリストア実装
 * Task 030: orgUnitIds によるスコープ対応（ユーザー所属ベース）
 */

import type {
  License,
  LicenseCategory,
  LicenseStatus,
  LicenseListFilter,
  LicenseStats,
  CreateLicenseRequest,
  UpdateLicenseRequest,
  ViewerContext,
} from './types';
import { canViewLicense, canManageLicense, canViewAllStats } from './types';

// ========== ストレージ ==========

const licensesStore = new Map<string, License>();
let idCounter = 1;

// ========== ユーティリティ ==========

function generateId(): string {
  return `lic_${String(idCounter++).padStart(4, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

const DEMO_USERS: Record<string, { name: string; orgUnitId: string }> = {
  user_001: { name: '山田太郎', orgUnitId: 'org_nishi' },
  user_002: { name: '佐藤次郎', orgUnitId: 'org_nishi' },
  user_003: { name: '鈴木花子', orgUnitId: 'org_higashi' },
  user_004: { name: '高橋三郎', orgUnitId: 'org_sakura' },
  user_005: { name: '田中美咲', orgUnitId: 'org_sakura' },
};

function getUserInfo(userId: string): { name: string; orgUnitId: string | null } {
  const info = DEMO_USERS[userId];
  return info ?? { name: userId, orgUnitId: null };
}

function calculateStatus(license: License): LicenseStatus {
  if (!license.expiresAt) return 'valid';

  const expiresDate = new Date(license.expiresAt);
  const today = new Date();
  const daysUntilExpiry = Math.ceil(
    (expiresDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring';
  return 'valid';
}

// ========== 一覧取得 ==========

export function listLicenses(
  viewer: ViewerContext,
  filter: LicenseListFilter
): { licenses: License[]; total: number } {
  let licenses = Array.from(licensesStore.values());

  // RBAC: staff/leaderは自分のみ
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    licenses = licenses.filter((l) => canViewLicense(l, viewer));
  }

  // Task 030: 組織スコープ（ユーザーの所属組織でフィルタ）
  if (filter.orgUnitIds && filter.orgUnitIds.length > 0) {
    licenses = licenses.filter(
      (l) => l.userOrgUnitId && filter.orgUnitIds!.includes(l.userOrgUnitId)
    );
  }

  // ユーザーフィルタ
  if (filter.userId) {
    licenses = licenses.filter((l) => l.userId === filter.userId);
  }

  // カテゴリフィルタ
  if (filter.category) {
    licenses = licenses.filter((l) => l.category === filter.category);
  }

  // ステータスフィルタ
  if (filter.status) {
    licenses = licenses.filter((l) => l.status === filter.status);
  }

  // 期限間近フィルタ
  if (filter.expiringWithinDays !== undefined) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + filter.expiringWithinDays);
    licenses = licenses.filter((l) => {
      if (!l.expiresAt) return false;
      const expiresDate = new Date(l.expiresAt);
      return expiresDate <= cutoffDate && l.status !== 'expired';
    });
  }

  // 検索
  if (filter.q) {
    const q = filter.q.toLowerCase();
    licenses = licenses.filter(
      (l) =>
        l.licenseName.toLowerCase().includes(q) ||
        (l.userName && l.userName.toLowerCase().includes(q)) ||
        (l.licenseNumber && l.licenseNumber.toLowerCase().includes(q))
    );
  }

  // ソート: status (expired/expiring優先) → expiresAt昇順
  const statusOrder: Record<LicenseStatus, number> = {
    expired: 0,
    expiring: 1,
    pending: 2,
    valid: 3,
  };
  licenses.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    // expiresAtで昇順ソート（期限が近い順）
    if (a.expiresAt && b.expiresAt) {
      return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    }
    return 0;
  });

  const total = licenses.length;

  // ページネーション
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  licenses = licenses.slice(offset, offset + limit);

  return { licenses, total };
}

// ========== 詳細取得 ==========

export function getById(
  id: string,
  viewer: ViewerContext
): { success: true; license: License } | { success: false; error: string } {
  const license = licensesStore.get(id);
  if (!license) {
    return { success: false, error: '資格が見つかりません' };
  }
  if (!canViewLicense(license, viewer)) {
    return { success: false, error: '閲覧権限がありません' };
  }
  return { success: true, license };
}

// ========== 作成 ==========

export function create(
  input: CreateLicenseRequest,
  actorUserId: string
): License {
  const timestamp = now();
  const userInfo = getUserInfo(input.userId);

  const license: License = {
    id: generateId(),
    userId: input.userId,
    userName: userInfo.name,
    userOrgUnitId: userInfo.orgUnitId,
    licenseName: input.licenseName,
    licenseNumber: input.licenseNumber ?? null,
    category: input.category ?? 'other',
    issuedAt: input.issuedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    issuingAuthority: input.issuingAuthority ?? null,
    status: 'valid',
    notes: input.notes ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // ステータス計算
  license.status = calculateStatus(license);

  licensesStore.set(license.id, license);
  return license;
}

// ========== 更新 ==========

export function update(
  id: string,
  patch: UpdateLicenseRequest,
  viewer: ViewerContext
): { success: true; license: License } | { success: false; error: string } {
  const license = licensesStore.get(id);
  if (!license) {
    return { success: false, error: '資格が見つかりません' };
  }
  if (!canManageLicense(viewer) && license.userId !== viewer.userId) {
    return { success: false, error: '更新権限がありません' };
  }

  const updated: License = {
    ...license,
    ...patch,
    updatedAt: now(),
  };

  // ステータス再計算
  updated.status = calculateStatus(updated);

  licensesStore.set(id, updated);
  return { success: true, license: updated };
}

// ========== 削除 ==========

export function remove(
  id: string,
  viewer: ViewerContext
): { success: true } | { success: false; error: string } {
  const license = licensesStore.get(id);
  if (!license) {
    return { success: false, error: '資格が見つかりません' };
  }
  if (!canManageLicense(viewer)) {
    return { success: false, error: '削除権限がありません' };
  }

  licensesStore.delete(id);
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
  if (!canViewAllStats(viewer)) {
    return null;
  }

  let licenses = Array.from(licensesStore.values());

  // Task 030: 組織スコープ
  if (options?.orgUnitIds && options.orgUnitIds.length > 0) {
    licenses = licenses.filter(
      (l) => l.userOrgUnitId && options.orgUnitIds!.includes(l.userOrgUnitId)
    );
  }

  // ステータス再計算して集計
  const stats: LicenseStats = {
    total: licenses.length,
    valid: 0,
    expired: 0,
    expiring30: 0,
    pending: 0,
  };

  for (const license of licenses) {
    const status = calculateStatus(license);
    switch (status) {
      case 'valid':
        stats.valid++;
        break;
      case 'expired':
        stats.expired++;
        break;
      case 'expiring':
        stats.expiring30++;
        break;
      case 'pending':
        stats.pending++;
        break;
    }
  }

  return stats;
}

// ========== 期限切れ/期限間近スキャン ==========

export function scanExpired(): License[] {
  return Array.from(licensesStore.values()).filter(
    (l) => calculateStatus(l) === 'expired'
  );
}

export function scanExpiring(withinDays: number = 30): License[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + withinDays);

  return Array.from(licensesStore.values()).filter((l) => {
    if (!l.expiresAt) return false;
    const expiresDate = new Date(l.expiresAt);
    const today = new Date();
    return expiresDate > today && expiresDate <= cutoffDate;
  });
}

// ========== ユーザーの資格一覧 ==========

export function getByUserId(userId: string): License[] {
  return Array.from(licensesStore.values())
    .filter((l) => l.userId === userId)
    .map((l) => ({ ...l, status: calculateStatus(l) }));
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (licensesStore.size > 0) return;

  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const sixMonthsLater = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const items: Omit<License, 'id' | 'createdAt' | 'updatedAt' | 'status'>[] = [
    // user_001 (org_nishi)
    {
      userId: 'user_001',
      userName: '山田太郎',
      userOrgUnitId: 'org_nishi',
      licenseName: '介護福祉士',
      licenseNumber: 'CW-12345',
      category: 'care',
      issuedAt: oneYearAgo.toISOString(),
      expiresAt: oneYearLater.toISOString(),
      issuingAuthority: '厚生労働省',
      notes: null,
    },
    {
      userId: 'user_001',
      userName: '山田太郎',
      userOrgUnitId: 'org_nishi',
      licenseName: '普通自動車免許',
      licenseNumber: '012345678901',
      category: 'driving',
      issuedAt: threeMonthsAgo.toISOString(),
      expiresAt: twoWeeksLater.toISOString(),  // 期限間近
      issuingAuthority: '大阪府公安委員会',
      notes: '更新必要',
    },
    // user_002 (org_nishi)
    {
      userId: 'user_002',
      userName: '佐藤次郎',
      userOrgUnitId: 'org_nishi',
      licenseName: 'ホームヘルパー2級',
      licenseNumber: 'HH-54321',
      category: 'care',
      issuedAt: oneYearAgo.toISOString(),
      expiresAt: null,  // 期限なし
      issuingAuthority: '大阪府',
      notes: null,
    },
    // user_003 (org_higashi)
    {
      userId: 'user_003',
      userName: '鈴木花子',
      userOrgUnitId: 'org_higashi',
      licenseName: '介護支援専門員',
      licenseNumber: 'CM-98765',
      category: 'care',
      issuedAt: oneYearAgo.toISOString(),
      expiresAt: thirtyDaysAgo.toISOString(),  // 期限切れ
      issuingAuthority: '大阪府',
      notes: '更新手続き中',
    },
    // user_004 (org_sakura)
    {
      userId: 'user_004',
      userName: '高橋三郎',
      userOrgUnitId: 'org_sakura',
      licenseName: '正看護師',
      licenseNumber: 'RN-11111',
      category: 'nursing',
      issuedAt: oneYearAgo.toISOString(),
      expiresAt: sixMonthsLater.toISOString(),
      issuingAuthority: '厚生労働省',
      notes: null,
    },
    {
      userId: 'user_004',
      userName: '高橋三郎',
      userOrgUnitId: 'org_sakura',
      licenseName: '救急救命講習修了',
      licenseNumber: null,
      category: 'safety',
      issuedAt: threeMonthsAgo.toISOString(),
      expiresAt: oneYearLater.toISOString(),
      issuingAuthority: '日本赤十字社',
      notes: null,
    },
    // user_005 (org_sakura)
    {
      userId: 'user_005',
      userName: '田中美咲',
      userOrgUnitId: 'org_sakura',
      licenseName: '准看護師',
      licenseNumber: 'LPN-22222',
      category: 'nursing',
      issuedAt: oneYearAgo.toISOString(),
      expiresAt: oneYearLater.toISOString(),
      issuingAuthority: '大阪府知事',
      notes: null,
    },
  ];

  items.forEach((item) => {
    const license: License = {
      ...item,
      id: generateId(),
      status: 'valid',  // 後で再計算
      createdAt: oneYearAgo.toISOString(),
      updatedAt: now.toISOString(),
    };
    license.status = calculateStatus(license);
    licensesStore.set(license.id, license);
  });
}

initDemoData();
