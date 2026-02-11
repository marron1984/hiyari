/**
 * 外部関係者アカウント Firestoreリポジトリ
 *
 * PROD-003: 本番永続化
 *
 * コレクション: external_accounts, external_account_logs, external_account_policies
 *
 * 対応関数:
 * - listExternalUsers / getExternalUserById / getExternalUserByEmail: 閲覧
 * - createExternalUser / updateExternalUser / disableExternalUser / activateExternalUser: CRUD
 * - getAccessPolicy / updateAccessPolicy: アクセスポリシー
 * - addAuditLog / getAuditLogs: 監査ログ
 * - getStats / scanExpiredUsers / autoDisableExpiredUsers: 統計・スキャン
 */

import { getAdminDb } from '@/lib/firebase-admin';
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

// ========== 定数 ==========

const USERS_COLLECTION = 'external_accounts';
const LOGS_COLLECTION = 'external_account_logs';
const POLICIES_COLLECTION = 'external_account_policies';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== フィルタ型 ==========

export interface ListExternalUsersFilters {
  status?: ExternalUserStatus;
  role?: ExternalRoleId;
  search?: string;
}

// ========== ドキュメント変換 ==========

function docToUser(doc: FirebaseFirestore.DocumentSnapshot): ExternalUser | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    email: data.email ?? '',
    displayName: data.displayName ?? '',
    organization: data.organization ?? null,
    role: data.role ?? 'external_other',
    status: data.status ?? 'invited',
    invitedAt: data.invitedAt ?? null,
    lastLoginAt: data.lastLoginAt ?? null,
    expiresAt: data.expiresAt ?? null,
    createdByUserId: data.createdByUserId ?? 'system',
    createdByName: data.createdByName ?? null,
    note: data.note ?? null,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToPolicy(doc: FirebaseFirestore.DocumentSnapshot): ExternalAccessPolicy | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    externalUserId: data.externalUserId ?? '',
    allowSections: data.allowSections ?? [],
    allowBusinessUnitIds: data.allowBusinessUnitIds ?? [],
    entityConfig: data.entityConfig ?? {},
    masking: data.masking ?? {},
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToLog(doc: FirebaseFirestore.DocumentSnapshot): ExternalAuditLog | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    externalUserId: data.externalUserId ?? '',
    action: data.action ?? 'view',
    targetType: data.targetType ?? null,
    targetId: data.targetId ?? null,
    details: data.details ?? null,
    ipAddress: data.ipAddress ?? null,
    userAgent: data.userAgent ?? null,
    timestamp: data.timestamp ?? now(),
  };
}

// ========== 外部ユーザー CRUD ==========

export async function listExternalUsers(
  viewer: ViewerContext,
  filters: ListExternalUsersFilters = {}
): Promise<ExternalUser[]> {
  if (!canViewExternalAccounts(viewer.role)) {
    return [];
  }

  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(USERS_COLLECTION);

    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters.role) {
      query = query.where('role', '==', filters.role);
    }

    const snap = await query.get();
    let users = snap.docs.map((d) => docToUser(d)!).filter(Boolean);

    // テキスト検索（メモリ内）
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
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] listExternalUsers error:', error);
    return [];
  }
}

export async function getExternalUserById(
  id: string,
  viewer: ViewerContext
): Promise<ExternalUser | null> {
  if (!canViewExternalAccounts(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();
    const doc = await db.collection(USERS_COLLECTION).doc(id).get();
    return docToUser(doc);
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] getExternalUserById error:', error);
    return null;
  }
}

export async function getExternalUserByEmail(
  email: string,
  viewer: ViewerContext
): Promise<ExternalUser | null> {
  if (!canViewExternalAccounts(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection(USERS_COLLECTION)
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();

    if (snap.empty) return null;
    return docToUser(snap.docs[0]);
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] getExternalUserByEmail error:', error);
    return null;
  }
}

export async function createExternalUser(
  input: CreateExternalUserInput,
  viewer: ViewerContext
): Promise<{ success: true; user: ExternalUser } | { success: false; error: string }> {
  if (!canManageExternalAccounts(viewer.role)) {
    return { success: false, error: '外部アカウントを作成する権限がありません' };
  }

  try {
    const db = getAdminDb();

    // メールアドレス重複チェック
    const existingSnap = await db
      .collection(USERS_COLLECTION)
      .where('email', '==', input.email.toLowerCase())
      .limit(1)
      .get();

    if (!existingSnap.empty) {
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
      createdByName: null,
      note: input.note ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.collection(USERS_COLLECTION).doc(userId).set(user);

    // デフォルトアクセスポリシーを作成
    const roleDefinition = getExternalRole(input.role);

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

    const policyId = generateId('policy');
    const policy: ExternalAccessPolicy = {
      id: policyId,
      externalUserId: userId,
      allowSections: roleDefinition?.allowedSections ?? [],
      allowBusinessUnitIds: [],
      entityConfig,
      masking: getDefaultMasking(input.role),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.collection(POLICIES_COLLECTION).doc(policyId).set(policy);

    // 監査ログ
    await addAuditLog(userId, 'invited', null, null, `役割: ${roleDefinition?.label}`, viewer.userId);

    return { success: true, user };
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] createExternalUser error:', error);
    return { success: false, error: '外部アカウントの作成に失敗しました' };
  }
}

export async function updateExternalUser(
  id: string,
  patch: UpdateExternalUserInput,
  viewer: ViewerContext
): Promise<{ success: true; user: ExternalUser } | { success: false; error: string }> {
  if (!canManageExternalAccounts(viewer.role)) {
    return { success: false, error: '外部アカウントを更新する権限がありません' };
  }

  try {
    const db = getAdminDb();
    const docRef = db.collection(USERS_COLLECTION).doc(id);
    const doc = await docRef.get();
    const existing = docToUser(doc);

    if (!existing) {
      return { success: false, error: '外部ユーザーが見つかりません' };
    }

    const timestamp = now();
    const previousStatus = existing.status;

    const updateData: Record<string, unknown> = {
      ...patch,
      updatedAt: timestamp,
    };

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    const updated = docToUser(updatedDoc)!;

    // ステータス変更の監査ログ
    if (patch.status && patch.status !== previousStatus) {
      if (patch.status === 'active') {
        await addAuditLog(id, 'activated', null, null, `${previousStatus}から有効化`, viewer.userId);
      } else if (patch.status === 'disabled') {
        await addAuditLog(id, 'disabled', null, null, `${previousStatus}から無効化`, viewer.userId);
      }
    }

    return { success: true, user: updated };
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] updateExternalUser error:', error);
    return { success: false, error: '外部アカウントの更新に失敗しました' };
  }
}

export async function disableExternalUser(
  id: string,
  viewer: ViewerContext
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await updateExternalUser(id, { status: 'disabled' }, viewer);
  if (!result.success) return result;
  return { success: true };
}

export async function activateExternalUser(
  id: string,
  viewer: ViewerContext
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await updateExternalUser(id, { status: 'active' }, viewer);
  if (!result.success) return result;
  return { success: true };
}

// ========== アクセスポリシー ==========

export async function getAccessPolicy(
  externalUserId: string
): Promise<ExternalAccessPolicy | null> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(POLICIES_COLLECTION)
      .where('externalUserId', '==', externalUserId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return docToPolicy(snap.docs[0]);
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] getAccessPolicy error:', error);
    return null;
  }
}

export async function updateAccessPolicy(
  externalUserId: string,
  patch: UpdateAccessPolicyInput,
  viewer: ViewerContext
): Promise<{ success: true; policy: ExternalAccessPolicy } | { success: false; error: string }> {
  if (!canManageExternalAccounts(viewer.role)) {
    return { success: false, error: 'アクセスポリシーを更新する権限がありません' };
  }

  try {
    const existing = await getAccessPolicy(externalUserId);
    if (!existing) {
      return { success: false, error: 'アクセスポリシーが見つかりません' };
    }

    const db = getAdminDb();
    const timestamp = now();

    const updated: ExternalAccessPolicy = {
      ...existing,
      allowSections: patch.allowSections ?? existing.allowSections,
      allowBusinessUnitIds: patch.allowBusinessUnitIds ?? existing.allowBusinessUnitIds,
      entityConfig: patch.entityConfig ?? existing.entityConfig,
      masking: patch.masking ? { ...existing.masking, ...patch.masking } : existing.masking,
      updatedAt: timestamp,
    };

    await db.collection(POLICIES_COLLECTION).doc(existing.id).set(updated);

    // 監査ログ
    await addAuditLog(externalUserId, 'policy_updated', null, null, null, viewer.userId);

    return { success: true, policy: updated };
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] updateAccessPolicy error:', error);
    return { success: false, error: 'アクセスポリシーの更新に失敗しました' };
  }
}

// ========== 監査ログ ==========

export async function addAuditLog(
  externalUserId: string,
  action: ExternalAuditAction,
  targetType: string | null,
  targetId: string | null,
  details: string | null,
  actorUserId?: string | null,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<ExternalAuditLog> {
  const logId = generateId('log');
  const log: ExternalAuditLog = {
    id: logId,
    externalUserId,
    action,
    targetType,
    targetId,
    details,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    timestamp: now(),
  };

  try {
    const db = getAdminDb();
    await db.collection(LOGS_COLLECTION).doc(logId).set(log);
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] addAuditLog error:', error);
  }

  return log;
}

export async function getAuditLogs(
  viewer: ViewerContext,
  filters: {
    externalUserId?: string;
    action?: ExternalAuditAction;
    limit?: number;
  } = {}
): Promise<ExternalAuditLog[]> {
  if (!canViewExternalAccounts(viewer.role)) {
    return [];
  }

  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(LOGS_COLLECTION);

    if (filters.externalUserId) {
      query = query.where('externalUserId', '==', filters.externalUserId);
    }
    if (filters.action) {
      query = query.where('action', '==', filters.action);
    }

    query = query.orderBy('timestamp', 'desc');

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const snap = await query.get();
    return snap.docs.map((d) => docToLog(d)!).filter(Boolean);
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] getAuditLogs error:', error);
    return [];
  }
}

// ========== 統計 ==========

export async function getStats(viewer: ViewerContext): Promise<ExternalAccountsStats | null> {
  if (!canViewExternalAccounts(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection(USERS_COLLECTION).get();
    const users = snap.docs.map((d) => docToUser(d)!).filter(Boolean);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

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
      if (user.status === 'active') active++;
      else if (user.status === 'invited') invited++;
      else if (user.status === 'disabled') disabled++;

      byRole[user.role] = (byRole[user.role] || 0) + 1;

      if (isExpiringSoon(user)) {
        expiringSoon++;
      }

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
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] getStats error:', error);
    return null;
  }
}

// ========== 期限切れチェック ==========

export async function scanExpiredUsers(): Promise<ExternalUser[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(USERS_COLLECTION)
      .where('status', '==', 'active')
      .get();

    return snap.docs
      .map((d) => docToUser(d)!)
      .filter(Boolean)
      .filter((u) => isExpired(u));
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] scanExpiredUsers error:', error);
    return [];
  }
}

export async function autoDisableExpiredUsers(viewer: ViewerContext): Promise<number> {
  if (!canManageExternalAccounts(viewer.role)) {
    return 0;
  }

  try {
    const expired = await scanExpiredUsers();
    const db = getAdminDb();
    const timestamp = now();

    for (const user of expired) {
      await db.collection(USERS_COLLECTION).doc(user.id).update({
        status: 'disabled',
        updatedAt: timestamp,
      });
      await addAuditLog(user.id, 'expired', null, null, '期限切れにより自動無効化');
    }

    return expired.length;
  } catch (error) {
    console.error('[ExternalAccounts:Firestore] autoDisableExpiredUsers error:', error);
    return 0;
  }
}
