/**
 * 外部関係者アカウント リポジトリ
 *
 * 外部ユーザーCRUD、アクセスポリシー、監査ログ
 * 現状は in-memory ストレージ（将来 DB 置換）
 */

import type {
  ExternalUser,
  ExternalUserStatus,
  ExternalAccessPolicy,
  ExternalAuditLog,
  ExternalAuditAction,
  ExternalAccountsStats,
  ViewerContext,
  CreateExternalUserInput,
  UpdateExternalUserInput,
  UpdateAccessPolicyInput,
} from './types';
import {
  canViewExternalAccounts,
  canManageExternalAccounts,
  isExpired,
  isExpiringSoon,
} from './types';
import { getExternalRole, getDefaultMasking, type ExternalRoleId } from '@/config/externalRoles';

// ========== ストレージ ==========

const externalUsersStore = new Map<string, ExternalUser>();
const accessPoliciesStore = new Map<string, ExternalAccessPolicy>();
const auditLogsStore: ExternalAuditLog[] = [];

// ========== ユーティリティ ==========

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== 外部ユーザー CRUD ==========

export interface ListExternalUsersFilters {
  status?: ExternalUserStatus;
  role?: ExternalRoleId;
  search?: string;
}

export function listExternalUsers(
  viewer: ViewerContext,
  filters: ListExternalUsersFilters = {}
): ExternalUser[] {
  if (!canViewExternalAccounts(viewer.role)) {
    return [];
  }

  let users = Array.from(externalUsersStore.values());

  // フィルタリング
  if (filters.status) {
    users = users.filter((u) => u.status === filters.status);
  }
  if (filters.role) {
    users = users.filter((u) => u.role === filters.role);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    users = users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.organization?.toLowerCase().includes(q) ?? false)
    );
  }

  // ソート（作成日降順）
  users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return users;
}

export function getExternalUserById(id: string, viewer: ViewerContext): ExternalUser | null {
  if (!canViewExternalAccounts(viewer.role)) {
    return null;
  }
  return externalUsersStore.get(id) ?? null;
}

export function getExternalUserByEmail(email: string, viewer: ViewerContext): ExternalUser | null {
  if (!canViewExternalAccounts(viewer.role)) {
    return null;
  }
  const users = Array.from(externalUsersStore.values());
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function createExternalUser(
  input: CreateExternalUserInput,
  viewer: ViewerContext
): { success: true; user: ExternalUser } | { success: false; error: string } {
  if (!canManageExternalAccounts(viewer.role)) {
    return { success: false, error: '外部アカウントを作成する権限がありません' };
  }

  // メールアドレス重複チェック
  const existing = Array.from(externalUsersStore.values()).find(
    (u) => u.email.toLowerCase() === input.email.toLowerCase()
  );
  if (existing) {
    return { success: false, error: 'このメールアドレスは既に登録されています' };
  }

  const timestamp = now();
  const userId = generateId('ext');
  const user: ExternalUser = {
    id: userId,
    email: input.email.toLowerCase(),
    displayName: input.displayName,
    organization: input.organization ?? null,
    role: input.role,
    status: input.activateImmediately ? 'active' : 'invited',
    invitedAt: timestamp,
    lastLoginAt: null,
    expiresAt: input.expiresAt ?? null,
    createdByUserId: viewer.userId,
    createdByName: null,  // 後で取得
    note: input.note ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  externalUsersStore.set(user.id, user);

  // デフォルトアクセスポリシーを作成
  const roleDefinition = getExternalRole(input.role);

  // entityAccessからentityConfigへの変換
  const entityConfig: Record<string, { onlyAssigned?: boolean; aggregateOnly?: boolean }> = {};
  if (roleDefinition?.entityAccess) {
    for (const [key, value] of Object.entries(roleDefinition.entityAccess)) {
      if (value) {
        entityConfig[key] = {
          onlyAssigned: value.onlyAssigned,
          aggregateOnly: value.aggregateOnly,
        };
      }
    }
  }

  const policy: ExternalAccessPolicy = {
    id: generateId('policy'),
    externalUserId: userId,
    allowSections: roleDefinition?.allowedSections ?? [],
    allowBusinessUnitIds: [],
    entityConfig,
    masking: getDefaultMasking(input.role),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  accessPoliciesStore.set(policy.id, policy);

  // 監査ログ
  addAuditLog(userId, 'invited', null, null, `役割: ${roleDefinition?.label}`, viewer.userId);

  return { success: true, user };
}

export function updateExternalUser(
  id: string,
  patch: UpdateExternalUserInput,
  viewer: ViewerContext
): { success: true; user: ExternalUser } | { success: false; error: string } {
  if (!canManageExternalAccounts(viewer.role)) {
    return { success: false, error: '外部アカウントを更新する権限がありません' };
  }

  const existing = externalUsersStore.get(id);
  if (!existing) {
    return { success: false, error: '外部ユーザーが見つかりません' };
  }

  const timestamp = now();
  const previousStatus = existing.status;
  const updated: ExternalUser = {
    ...existing,
    ...patch,
    updatedAt: timestamp,
  };

  externalUsersStore.set(id, updated);

  // ステータス変更の監査ログ
  if (patch.status && patch.status !== previousStatus) {
    if (patch.status === 'active') {
      addAuditLog(id, 'activated', null, null, `${previousStatus}から有効化`, viewer.userId);
    } else if (patch.status === 'disabled') {
      addAuditLog(id, 'disabled', null, null, `${previousStatus}から無効化`, viewer.userId);
    }
  }

  return { success: true, user: updated };
}

export function disableExternalUser(
  id: string,
  viewer: ViewerContext
): { success: true } | { success: false; error: string } {
  const result = updateExternalUser(id, { status: 'disabled' }, viewer);
  if (!result.success) return result;
  return { success: true };
}

export function activateExternalUser(
  id: string,
  viewer: ViewerContext
): { success: true } | { success: false; error: string } {
  const result = updateExternalUser(id, { status: 'active' }, viewer);
  if (!result.success) return result;
  return { success: true };
}

// ========== アクセスポリシー ==========

export function getAccessPolicy(externalUserId: string): ExternalAccessPolicy | null {
  const policies = Array.from(accessPoliciesStore.values());
  return policies.find((p) => p.externalUserId === externalUserId) ?? null;
}

export function updateAccessPolicy(
  externalUserId: string,
  patch: UpdateAccessPolicyInput,
  viewer: ViewerContext
): { success: true; policy: ExternalAccessPolicy } | { success: false; error: string } {
  if (!canManageExternalAccounts(viewer.role)) {
    return { success: false, error: 'アクセスポリシーを更新する権限がありません' };
  }

  const existing = getAccessPolicy(externalUserId);
  if (!existing) {
    return { success: false, error: 'アクセスポリシーが見つかりません' };
  }

  const timestamp = now();
  const updated: ExternalAccessPolicy = {
    ...existing,
    allowSections: patch.allowSections ?? existing.allowSections,
    allowBusinessUnitIds: patch.allowBusinessUnitIds ?? existing.allowBusinessUnitIds,
    entityConfig: patch.entityConfig ?? existing.entityConfig,
    masking: patch.masking ? { ...existing.masking, ...patch.masking } : existing.masking,
    updatedAt: timestamp,
  };

  accessPoliciesStore.set(existing.id, updated);

  // 監査ログ
  addAuditLog(externalUserId, 'policy_updated', null, null, null, viewer.userId);

  return { success: true, policy: updated };
}

// ========== 監査ログ ==========

export function addAuditLog(
  externalUserId: string,
  action: ExternalAuditAction,
  targetType: string | null,
  targetId: string | null,
  details: string | null,
  actorUserId?: string | null,
  ipAddress?: string | null,
  userAgent?: string | null
): ExternalAuditLog {
  const log: ExternalAuditLog = {
    id: generateId('log'),
    externalUserId,
    action,
    targetType,
    targetId,
    details,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    timestamp: now(),
  };

  auditLogsStore.push(log);
  return log;
}

export function getAuditLogs(
  viewer: ViewerContext,
  filters: {
    externalUserId?: string;
    action?: ExternalAuditAction;
    limit?: number;
  } = {}
): ExternalAuditLog[] {
  if (!canViewExternalAccounts(viewer.role)) {
    return [];
  }

  let logs = [...auditLogsStore];

  if (filters.externalUserId) {
    logs = logs.filter((l) => l.externalUserId === filters.externalUserId);
  }
  if (filters.action) {
    logs = logs.filter((l) => l.action === filters.action);
  }

  // タイムスタンプ降順
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (filters.limit) {
    logs = logs.slice(0, filters.limit);
  }

  return logs;
}

// ========== 統計 ==========

export function getStats(viewer: ViewerContext): ExternalAccountsStats | null {
  if (!canViewExternalAccounts(viewer.role)) {
    return null;
  }

  const users = Array.from(externalUsersStore.values());
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const byRole: Record<ExternalRoleId, number> = {
    external_auditor: 0,
    external_vendor: 0,
    external_accountant: 0,
    external_lawyer: 0,
    external_other: 0,
  };

  let active = 0;
  let invited = 0;
  let disabled = 0;
  let expiringSoon = 0;
  let recentLogins = 0;

  for (const user of users) {
    // ステータス別
    if (user.status === 'active') active++;
    else if (user.status === 'invited') invited++;
    else if (user.status === 'disabled') disabled++;

    // ロール別
    byRole[user.role] = (byRole[user.role] || 0) + 1;

    // 期限切れ間近
    if (isExpiringSoon(user)) {
      expiringSoon++;
    }

    // 最近のログイン
    if (user.lastLoginAt && new Date(user.lastLoginAt) > sevenDaysAgo) {
      recentLogins++;
    }
  }

  return {
    total: users.length,
    active,
    invited,
    disabled,
    byRole,
    expiringSoon,
    recentLogins,
  };
}

// ========== 期限切れチェック（バッチ用） ==========

export function scanExpiredUsers(): ExternalUser[] {
  const users = Array.from(externalUsersStore.values());
  return users.filter((u) => u.status === 'active' && isExpired(u));
}

export function autoDisableExpiredUsers(viewer: ViewerContext): number {
  if (!canManageExternalAccounts(viewer.role)) {
    return 0;
  }

  const expired = scanExpiredUsers();
  for (const user of expired) {
    const updated: ExternalUser = {
      ...user,
      status: 'disabled',
      updatedAt: now(),
    };
    externalUsersStore.set(user.id, updated);
    addAuditLog(user.id, 'expired', null, null, '期限切れにより自動無効化');
  }

  return expired.length;
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (externalUsersStore.size > 0) return;

  const demoUsers: Omit<ExternalUser, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      email: 'audit@example-audit.co.jp',
      displayName: '山田 太郎',
      organization: '山田監査法人',
      role: 'external_auditor',
      status: 'active',
      invitedAt: '2025-01-10T10:00:00Z',
      lastLoginAt: '2026-01-28T14:30:00Z',
      expiresAt: '2026-12-31T23:59:59Z',
      createdByUserId: 'user_admin',
      createdByName: '管理者',
      note: '年次監査担当',
    },
    {
      email: 'tanaka@vendor-corp.jp',
      displayName: '田中 次郎',
      organization: '田中設備株式会社',
      role: 'external_vendor',
      status: 'active',
      invitedAt: '2025-02-01T09:00:00Z',
      lastLoginAt: '2026-01-20T11:00:00Z',
      expiresAt: '2026-06-30T23:59:59Z',
      createdByUserId: 'user_admin',
      createdByName: '管理者',
      note: '設備保守業者',
    },
    {
      email: 'suzuki@kaikei-office.jp',
      displayName: '鈴木 花子',
      organization: '鈴木会計事務所',
      role: 'external_accountant',
      status: 'active',
      invitedAt: '2025-03-01T10:00:00Z',
      lastLoginAt: '2026-01-25T16:00:00Z',
      expiresAt: null,
      createdByUserId: 'user_admin',
      createdByName: '管理者',
      note: '顧問会計士',
    },
    {
      email: 'sato@law-firm.jp',
      displayName: '佐藤 三郎',
      organization: '佐藤法律事務所',
      role: 'external_lawyer',
      status: 'invited',
      invitedAt: '2026-01-28T09:00:00Z',
      lastLoginAt: null,
      expiresAt: '2027-01-31T23:59:59Z',
      createdByUserId: 'user_admin',
      createdByName: '管理者',
      note: '契約書レビュー担当',
    },
    {
      email: 'former@old-vendor.jp',
      displayName: '高橋 四郎',
      organization: '旧取引先株式会社',
      role: 'external_vendor',
      status: 'disabled',
      invitedAt: '2024-06-01T09:00:00Z',
      lastLoginAt: '2024-12-15T10:00:00Z',
      expiresAt: '2024-12-31T23:59:59Z',
      createdByUserId: 'user_admin',
      createdByName: '管理者',
      note: '契約終了により無効化',
    },
  ];

  const timestamp = now();
  for (const data of demoUsers) {
    const userId = generateId('ext');
    const user: ExternalUser = {
      ...data,
      id: userId,
      createdAt: data.invitedAt ?? timestamp,
      updatedAt: timestamp,
    };
    externalUsersStore.set(user.id, user);

    // デフォルトアクセスポリシー
    const roleDefinition = getExternalRole(data.role);

    // entityAccessからentityConfigへの変換
    const entityConfig: Record<string, { onlyAssigned?: boolean; aggregateOnly?: boolean }> = {};
    if (roleDefinition?.entityAccess) {
      for (const [key, value] of Object.entries(roleDefinition.entityAccess)) {
        if (value) {
          entityConfig[key] = {
            onlyAssigned: value.onlyAssigned,
            aggregateOnly: value.aggregateOnly,
          };
        }
      }
    }

    const policy: ExternalAccessPolicy = {
      id: generateId('policy'),
      externalUserId: userId,
      allowSections: roleDefinition?.allowedSections ?? [],
      allowBusinessUnitIds: [],
      entityConfig,
      masking: getDefaultMasking(data.role),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    accessPoliciesStore.set(policy.id, policy);
  }

  // デモ監査ログ
  const demoLogs: Omit<ExternalAuditLog, 'id'>[] = [
    {
      externalUserId: Array.from(externalUsersStore.values())[0]?.id ?? '',
      action: 'login',
      targetType: null,
      targetId: null,
      details: null,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      timestamp: '2026-01-28T14:30:00Z',
    },
    {
      externalUserId: Array.from(externalUsersStore.values())[0]?.id ?? '',
      action: 'view',
      targetType: 'wbr',
      targetId: 'wbr_2026_04',
      details: '週次レビュー閲覧',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      timestamp: '2026-01-28T14:35:00Z',
    },
    {
      externalUserId: Array.from(externalUsersStore.values())[1]?.id ?? '',
      action: 'login',
      targetType: null,
      targetId: null,
      details: null,
      ipAddress: '10.0.0.50',
      userAgent: 'Mozilla/5.0',
      timestamp: '2026-01-20T11:00:00Z',
    },
    {
      externalUserId: Array.from(externalUsersStore.values())[1]?.id ?? '',
      action: 'view',
      targetType: 'repairs',
      targetId: 'repair_123',
      details: '修繕チケット閲覧',
      ipAddress: '10.0.0.50',
      userAgent: 'Mozilla/5.0',
      timestamp: '2026-01-20T11:05:00Z',
    },
  ];

  for (const data of demoLogs) {
    if (data.externalUserId) {
      auditLogsStore.push({
        ...data,
        id: generateId('log'),
      });
    }
  }
}

// 初期化
initDemoData();
