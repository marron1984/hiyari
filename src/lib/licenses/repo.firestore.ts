/**
 * 資格管理（Licenses）Firestoreリポジトリ
 *
 * PROD-003: 本番永続化
 *
 * コレクション: licenses, license_types, license_renewal_events
 *
 * Task 030: orgUnitIds によるスコープ対応
 *
 * 対応関数:
 * - listLicenseTypes / getLicenseTypeById: 種別マスタ
 * - listLicenses / getById: 閲覧
 * - create / update / renew / remove: CRUD
 * - getStats / scanExpired / scanExpiring: 統計・スキャン
 * - getByUserId / getRenewalHistory: 個別取得
 */

import { getAdminDb } from '@/lib/firebase-admin';
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

// ========== 定数 ==========

const LICENSES_COLLECTION = 'licenses';
const LICENSE_TYPES_COLLECTION = 'license_types';
const RENEWAL_EVENTS_COLLECTION = 'license_renewal_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * expiresAt から status を自動計算
 */
function calculateStatus(expiresAt: string | null): UserLicenseStatus {
  if (!expiresAt) return 'active';
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

// ========== ドキュメント変換 ==========

function docToLicenseType(doc: FirebaseFirestore.DocumentSnapshot): LicenseType | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    name: data.name ?? '',
    category: data.category ?? 'other',
    requiresRenewal: data.requiresRenewal ?? false,
    defaultRenewalMonths: data.defaultRenewalMonths ?? null,
    defaultWarnDays: data.defaultWarnDays ?? null,
    isActive: data.isActive ?? true,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

interface LicenseDoc extends UserLicense {
  userName?: string | null;
  userOrgUnitId?: string | null;
}

function docToLicense(doc: FirebaseFirestore.DocumentSnapshot): LicenseDoc | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    userId: data.userId ?? '',
    licenseTypeId: data.licenseTypeId ?? '',
    licenseNumber: data.licenseNumber ?? null,
    issuedAt: data.issuedAt ?? null,
    expiresAt: data.expiresAt ?? null,
    status: data.status ?? 'unknown',
    notes: data.notes ?? null,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
    // 非正規化フィールド
    userName: data.userName ?? null,
    userOrgUnitId: data.userOrgUnitId ?? null,
  };
}

function docToRenewalEvent(doc: FirebaseFirestore.DocumentSnapshot): LicenseRenewalEvent | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    userLicenseId: data.userLicenseId ?? '',
    oldExpiresAt: data.oldExpiresAt ?? null,
    newExpiresAt: data.newExpiresAt ?? null,
    renewedAt: data.renewedAt ?? null,
    actorUserId: data.actorUserId ?? null,
    note: data.note ?? null,
    createdAt: data.createdAt ?? now(),
  };
}

// ========== リストアイテム構築ヘルパー ==========

async function buildListItem(
  licenseDoc: LicenseDoc,
  licenseTypesCache: Map<string, LicenseType>
): Promise<LicenseListItem | null> {
  let lt = licenseTypesCache.get(licenseDoc.licenseTypeId);
  if (!lt) {
    // キャッシュにない場合はFirestoreから取得
    try {
      const db = getAdminDb();
      const ltDoc = await db.collection(LICENSE_TYPES_COLLECTION).doc(licenseDoc.licenseTypeId).get();
      lt = docToLicenseType(ltDoc) ?? undefined;
      if (lt) licenseTypesCache.set(lt.id, lt);
    } catch {
      return null;
    }
  }
  if (!lt || !lt.isActive) return null;

  const currentStatus = calculateStatus(licenseDoc.expiresAt);
  const effectiveStatus = licenseDoc.status === 'suspended' ? 'suspended' : currentStatus;

  return {
    userLicense: {
      id: licenseDoc.id,
      userId: licenseDoc.userId,
      licenseTypeId: licenseDoc.licenseTypeId,
      licenseNumber: licenseDoc.licenseNumber,
      issuedAt: licenseDoc.issuedAt,
      expiresAt: licenseDoc.expiresAt,
      status: effectiveStatus,
      notes: licenseDoc.notes,
      createdAt: licenseDoc.createdAt,
      updatedAt: licenseDoc.updatedAt,
    },
    licenseType: {
      id: lt.id,
      name: lt.name,
      category: lt.category,
      requiresRenewal: lt.requiresRenewal,
      defaultWarnDays: lt.defaultWarnDays,
    },
    user: {
      id: licenseDoc.userId,
      name: licenseDoc.userName ?? null,
      orgUnitId: licenseDoc.userOrgUnitId ?? null,
    },
  };
}

// ========== 資格種別マスタ ==========

export async function listLicenseTypes(): Promise<LicenseType[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(LICENSE_TYPES_COLLECTION)
      .where('isActive', '==', true)
      .get();
    return snap.docs.map((d) => docToLicenseType(d)!).filter(Boolean);
  } catch (error) {
    console.error('[Licenses:Firestore] listLicenseTypes error:', error);
    return [];
  }
}

export async function getLicenseTypeById(id: string): Promise<LicenseType | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(LICENSE_TYPES_COLLECTION).doc(id).get();
    return docToLicenseType(doc);
  } catch (error) {
    console.error('[Licenses:Firestore] getLicenseTypeById error:', error);
    return null;
  }
}

// ========== 一覧取得 ==========

export async function listLicenses(
  viewer: ViewerContext,
  filters: LicenseListFilters,
  pagination?: Pagination
): Promise<{ items: LicenseListItem[]; total: number }> {
  // staff/leader は myOnly 強制
  const effectiveFilters = { ...filters };
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    effectiveFilters.myOnly = true;
  }

  try {
    const db = getAdminDb();

    // 資格種別マスタをキャッシュ
    const ltSnap = await db.collection(LICENSE_TYPES_COLLECTION).get();
    const licenseTypesCache = new Map<string, LicenseType>();
    for (const d of ltSnap.docs) {
      const lt = docToLicenseType(d);
      if (lt) licenseTypesCache.set(lt.id, lt);
    }

    let query: FirebaseFirestore.Query = db.collection(LICENSES_COLLECTION);

    // myOnly / userId フィルタ
    if (effectiveFilters.myOnly) {
      query = query.where('userId', '==', viewer.userId);
    } else if (effectiveFilters.userId) {
      query = query.where('userId', '==', effectiveFilters.userId);
    }

    // licenseTypeId フィルタ
    if (effectiveFilters.licenseTypeId) {
      query = query.where('licenseTypeId', '==', effectiveFilters.licenseTypeId);
    }

    const snap = await query.get();
    const docs = snap.docs.map((d) => docToLicense(d)!).filter(Boolean);

    let items: LicenseListItem[] = [];

    for (const licDoc of docs) {
      const lt = licenseTypesCache.get(licDoc.licenseTypeId);
      if (!lt || !lt.isActive) continue;

      const user = {
        id: licDoc.userId,
        name: licDoc.userName ?? null,
        orgUnitId: licDoc.userOrgUnitId ?? null,
      };

      // RBAC / スコープチェック
      if (!canViewLicense(licDoc, user, viewer)) continue;

      // orgUnitIds フィルタ
      if (effectiveFilters.orgUnitIds && effectiveFilters.orgUnitIds.length > 0) {
        if (!user.orgUnitId || !effectiveFilters.orgUnitIds.includes(user.orgUnitId)) {
          continue;
        }
      }

      // status フィルタ
      const currentStatus = calculateStatus(licDoc.expiresAt);
      const effectiveStatus = licDoc.status === 'suspended' ? 'suspended' : currentStatus;
      if (effectiveFilters.status && effectiveFilters.status.length > 0) {
        if (!effectiveFilters.status.includes(effectiveStatus)) continue;
      }

      // category フィルタ
      if (effectiveFilters.category && lt.category !== effectiveFilters.category) continue;

      // expired フィルタ
      if (effectiveFilters.expired === true && effectiveStatus !== 'expired') continue;
      if (effectiveFilters.expired === false && effectiveStatus === 'expired') continue;

      // expiringWithinDays フィルタ
      if (effectiveFilters.expiringWithinDays !== undefined) {
        const days = daysUntilExpiry(licDoc.expiresAt);
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
        userLicense: {
          id: licDoc.id,
          userId: licDoc.userId,
          licenseTypeId: licDoc.licenseTypeId,
          licenseNumber: licDoc.licenseNumber,
          issuedAt: licDoc.issuedAt,
          expiresAt: licDoc.expiresAt,
          status: effectiveStatus,
          notes: licDoc.notes,
          createdAt: licDoc.createdAt,
          updatedAt: licDoc.updatedAt,
        },
        licenseType: {
          id: lt.id,
          name: lt.name,
          category: lt.category,
          requiresRenewal: lt.requiresRenewal,
          defaultWarnDays: lt.defaultWarnDays,
        },
        user,
      });
    }

    // ソート
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
  } catch (error) {
    console.error('[Licenses:Firestore] listLicenses error:', error);
    return { items: [], total: 0 };
  }
}

// ========== 詳細取得 ==========

export async function getById(
  id: string,
  viewer: ViewerContext
): Promise<{ success: true; item: LicenseListItem } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(LICENSES_COLLECTION).doc(id).get();
    const licDoc = docToLicense(doc);

    if (!licDoc) {
      return { success: false, error: '資格が見つかりません' };
    }

    const user = {
      id: licDoc.userId,
      name: licDoc.userName ?? null,
      orgUnitId: licDoc.userOrgUnitId ?? null,
    };

    if (!canViewLicense(licDoc, user, viewer)) {
      return { success: false, error: '閲覧権限がありません' };
    }

    const ltDoc = await db.collection(LICENSE_TYPES_COLLECTION).doc(licDoc.licenseTypeId).get();
    const lt = docToLicenseType(ltDoc);

    if (!lt) {
      return { success: false, error: '資格種別が見つかりません' };
    }

    const currentStatus = calculateStatus(licDoc.expiresAt);
    const effectiveStatus = licDoc.status === 'suspended' ? 'suspended' : currentStatus;

    return {
      success: true,
      item: {
        userLicense: {
          id: licDoc.id,
          userId: licDoc.userId,
          licenseTypeId: licDoc.licenseTypeId,
          licenseNumber: licDoc.licenseNumber,
          issuedAt: licDoc.issuedAt,
          expiresAt: licDoc.expiresAt,
          status: effectiveStatus,
          notes: licDoc.notes,
          createdAt: licDoc.createdAt,
          updatedAt: licDoc.updatedAt,
        },
        licenseType: {
          id: lt.id,
          name: lt.name,
          category: lt.category,
          requiresRenewal: lt.requiresRenewal,
          defaultWarnDays: lt.defaultWarnDays,
        },
        user,
      },
    };
  } catch (error) {
    console.error('[Licenses:Firestore] getById error:', error);
    return { success: false, error: '資格の取得に失敗しました' };
  }
}

// ========== 作成 ==========

export async function create(
  input: CreateUserLicenseRequest,
  actorUserId: string
): Promise<{ success: true; item: UserLicense } | { success: false; error: string }> {
  try {
    const db = getAdminDb();

    // 資格種別チェック
    const ltDoc = await db.collection(LICENSE_TYPES_COLLECTION).doc(input.licenseTypeId).get();
    const lt = docToLicenseType(ltDoc);
    if (!lt || !lt.isActive) {
      return { success: false, error: '無効な資格種別です' };
    }

    const timestamp = now();
    const licenseId = generateId('ul');

    const ul: UserLicense & { userName: string | null; userOrgUnitId: string | null } = {
      id: licenseId,
      userId: input.userId,
      licenseTypeId: input.licenseTypeId,
      licenseNumber: input.licenseNumber ?? null,
      issuedAt: input.issuedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      status: calculateStatus(input.expiresAt ?? null),
      notes: input.notes ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      // 非正規化フィールドは作成時に設定される想定
      userName: null,
      userOrgUnitId: null,
    };

    await db.collection(LICENSES_COLLECTION).doc(licenseId).set(ul);

    return {
      success: true,
      item: {
        id: ul.id,
        userId: ul.userId,
        licenseTypeId: ul.licenseTypeId,
        licenseNumber: ul.licenseNumber,
        issuedAt: ul.issuedAt,
        expiresAt: ul.expiresAt,
        status: ul.status,
        notes: ul.notes,
        createdAt: ul.createdAt,
        updatedAt: ul.updatedAt,
      },
    };
  } catch (error) {
    console.error('[Licenses:Firestore] create error:', error);
    return { success: false, error: '資格の作成に失敗しました' };
  }
}

// ========== 更新 ==========

export async function update(
  id: string,
  patch: UpdateUserLicenseRequest,
  viewer: ViewerContext
): Promise<{ success: true; item: UserLicense } | { success: false; error: string }> {
  if (!canManageLicense(viewer)) {
    return { success: false, error: '更新権限がありません' };
  }

  try {
    const db = getAdminDb();
    const docRef = db.collection(LICENSES_COLLECTION).doc(id);
    const doc = await docRef.get();
    const licDoc = docToLicense(doc);

    if (!licDoc) {
      return { success: false, error: '資格が見つかりません' };
    }

    const timestamp = now();
    const updateData: Record<string, unknown> = {
      ...patch,
      status: patch.status ?? calculateStatus(patch.expiresAt ?? licDoc.expiresAt),
      updatedAt: timestamp,
    };

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    const updated = docToLicense(updatedDoc)!;

    return {
      success: true,
      item: {
        id: updated.id,
        userId: updated.userId,
        licenseTypeId: updated.licenseTypeId,
        licenseNumber: updated.licenseNumber,
        issuedAt: updated.issuedAt,
        expiresAt: updated.expiresAt,
        status: updated.status,
        notes: updated.notes,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    };
  } catch (error) {
    console.error('[Licenses:Firestore] update error:', error);
    return { success: false, error: '資格の更新に失敗しました' };
  }
}

// ========== 更新 (renew) ==========

export async function renew(
  id: string,
  input: RenewLicenseRequest,
  viewer: ViewerContext
): Promise<
  { success: true; item: UserLicense; event: LicenseRenewalEvent } | { success: false; error: string }
> {
  if (!canManageLicense(viewer)) {
    return { success: false, error: '更新権限がありません' };
  }

  try {
    const db = getAdminDb();
    const docRef = db.collection(LICENSES_COLLECTION).doc(id);
    const doc = await docRef.get();
    const licDoc = docToLicense(doc);

    if (!licDoc) {
      return { success: false, error: '資格が見つかりません' };
    }

    const timestamp = now();
    const oldExpiresAt = licDoc.expiresAt;

    // 更新イベント記録
    const eventId = generateId('lre');
    const event: LicenseRenewalEvent = {
      id: eventId,
      userLicenseId: id,
      oldExpiresAt,
      newExpiresAt: input.newExpiresAt,
      renewedAt: timestamp,
      actorUserId: viewer.userId,
      note: input.note ?? null,
      createdAt: timestamp,
    };

    await db.collection(RENEWAL_EVENTS_COLLECTION).doc(eventId).set(event);

    // 資格更新
    const newStatus = calculateStatus(input.newExpiresAt);
    await docRef.update({
      expiresAt: input.newExpiresAt,
      status: newStatus,
      updatedAt: timestamp,
    });

    const updatedDoc = await docRef.get();
    const updated = docToLicense(updatedDoc)!;

    return {
      success: true,
      item: {
        id: updated.id,
        userId: updated.userId,
        licenseTypeId: updated.licenseTypeId,
        licenseNumber: updated.licenseNumber,
        issuedAt: updated.issuedAt,
        expiresAt: updated.expiresAt,
        status: updated.status,
        notes: updated.notes,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
      event,
    };
  } catch (error) {
    console.error('[Licenses:Firestore] renew error:', error);
    return { success: false, error: '資格の更新に失敗しました' };
  }
}

// ========== 削除 ==========

export async function remove(
  id: string,
  viewer: ViewerContext
): Promise<{ success: true } | { success: false; error: string }> {
  if (!canManageLicense(viewer)) {
    return { success: false, error: '削除権限がありません' };
  }

  try {
    const db = getAdminDb();
    const doc = await db.collection(LICENSES_COLLECTION).doc(id).get();

    if (!doc.exists) {
      return { success: false, error: '資格が見つかりません' };
    }

    await db.collection(LICENSES_COLLECTION).doc(id).delete();
    return { success: true };
  } catch (error) {
    console.error('[Licenses:Firestore] remove error:', error);
    return { success: false, error: '資格の削除に失敗しました' };
  }
}

// ========== 統計 ==========

export interface LicenseStatsOptions {
  orgUnitIds?: string[];
}

export async function getStats(
  viewer: ViewerContext,
  options?: LicenseStatsOptions
): Promise<LicenseStats | null> {
  if (!canViewLicenseStats(viewer)) {
    return null;
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection(LICENSES_COLLECTION).get();
    let docs = snap.docs.map((d) => docToLicense(d)!).filter(Boolean);

    // orgUnitIds スコープ
    if (options?.orgUnitIds && options.orgUnitIds.length > 0) {
      docs = docs.filter(
        (d) => d.userOrgUnitId && options.orgUnitIds!.includes(d.userOrgUnitId)
      );
    }

    const stats: LicenseStats = {
      expired: 0,
      expiring30: 0,
      expiring90: 0,
      totalActive: 0,
    };

    for (const licDoc of docs) {
      if (licDoc.status === 'suspended') continue;

      const currentStatus = calculateStatus(licDoc.expiresAt);
      const days = daysUntilExpiry(licDoc.expiresAt);

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
  } catch (error) {
    console.error('[Licenses:Firestore] getStats error:', error);
    return null;
  }
}

// ========== スキャン ==========

export async function scanExpired(): Promise<LicenseListItem[]> {
  try {
    const db = getAdminDb();

    // 資格種別マスタをキャッシュ
    const ltSnap = await db.collection(LICENSE_TYPES_COLLECTION).get();
    const ltCache = new Map<string, LicenseType>();
    for (const d of ltSnap.docs) {
      const lt = docToLicenseType(d);
      if (lt) ltCache.set(lt.id, lt);
    }

    const snap = await db.collection(LICENSES_COLLECTION).get();
    const items: LicenseListItem[] = [];

    for (const d of snap.docs) {
      const licDoc = docToLicense(d);
      if (!licDoc) continue;
      if (licDoc.status === 'suspended') continue;
      if (calculateStatus(licDoc.expiresAt) !== 'expired') continue;

      const lt = ltCache.get(licDoc.licenseTypeId);
      if (!lt) continue;

      items.push({
        userLicense: {
          id: licDoc.id,
          userId: licDoc.userId,
          licenseTypeId: licDoc.licenseTypeId,
          licenseNumber: licDoc.licenseNumber,
          issuedAt: licDoc.issuedAt,
          expiresAt: licDoc.expiresAt,
          status: 'expired',
          notes: licDoc.notes,
          createdAt: licDoc.createdAt,
          updatedAt: licDoc.updatedAt,
        },
        licenseType: {
          id: lt.id,
          name: lt.name,
          category: lt.category,
          requiresRenewal: lt.requiresRenewal,
          defaultWarnDays: lt.defaultWarnDays,
        },
        user: {
          id: licDoc.userId,
          name: licDoc.userName ?? null,
          orgUnitId: licDoc.userOrgUnitId ?? null,
        },
      });
    }

    return items;
  } catch (error) {
    console.error('[Licenses:Firestore] scanExpired error:', error);
    return [];
  }
}

export async function scanExpiring(withinDays: number = 30): Promise<LicenseListItem[]> {
  try {
    const db = getAdminDb();

    // 資格種別マスタをキャッシュ
    const ltSnap = await db.collection(LICENSE_TYPES_COLLECTION).get();
    const ltCache = new Map<string, LicenseType>();
    for (const d of ltSnap.docs) {
      const lt = docToLicenseType(d);
      if (lt) ltCache.set(lt.id, lt);
    }

    const snap = await db.collection(LICENSES_COLLECTION).get();
    const items: LicenseListItem[] = [];

    for (const d of snap.docs) {
      const licDoc = docToLicense(d);
      if (!licDoc) continue;
      if (licDoc.status === 'suspended') continue;

      const days = daysUntilExpiry(licDoc.expiresAt);
      if (days === null || days < 0 || days > withinDays) continue;

      const lt = ltCache.get(licDoc.licenseTypeId);
      if (!lt) continue;

      items.push({
        userLicense: {
          id: licDoc.id,
          userId: licDoc.userId,
          licenseTypeId: licDoc.licenseTypeId,
          licenseNumber: licDoc.licenseNumber,
          issuedAt: licDoc.issuedAt,
          expiresAt: licDoc.expiresAt,
          status: 'active',
          notes: licDoc.notes,
          createdAt: licDoc.createdAt,
          updatedAt: licDoc.updatedAt,
        },
        licenseType: {
          id: lt.id,
          name: lt.name,
          category: lt.category,
          requiresRenewal: lt.requiresRenewal,
          defaultWarnDays: lt.defaultWarnDays,
        },
        user: {
          id: licDoc.userId,
          name: licDoc.userName ?? null,
          orgUnitId: licDoc.userOrgUnitId ?? null,
        },
      });
    }

    return items;
  } catch (error) {
    console.error('[Licenses:Firestore] scanExpiring error:', error);
    return [];
  }
}

// ========== ユーザーの資格一覧 ==========

export async function getByUserId(userId: string): Promise<LicenseListItem[]> {
  try {
    const db = getAdminDb();

    // 資格種別マスタをキャッシュ
    const ltSnap = await db.collection(LICENSE_TYPES_COLLECTION).get();
    const ltCache = new Map<string, LicenseType>();
    for (const d of ltSnap.docs) {
      const lt = docToLicenseType(d);
      if (lt) ltCache.set(lt.id, lt);
    }

    const snap = await db
      .collection(LICENSES_COLLECTION)
      .where('userId', '==', userId)
      .get();

    const items: LicenseListItem[] = [];

    for (const d of snap.docs) {
      const licDoc = docToLicense(d);
      if (!licDoc) continue;

      const lt = ltCache.get(licDoc.licenseTypeId);
      if (!lt || !lt.isActive) continue;

      const currentStatus = calculateStatus(licDoc.expiresAt);
      const effectiveStatus = licDoc.status === 'suspended' ? 'suspended' : currentStatus;

      items.push({
        userLicense: {
          id: licDoc.id,
          userId: licDoc.userId,
          licenseTypeId: licDoc.licenseTypeId,
          licenseNumber: licDoc.licenseNumber,
          issuedAt: licDoc.issuedAt,
          expiresAt: licDoc.expiresAt,
          status: effectiveStatus,
          notes: licDoc.notes,
          createdAt: licDoc.createdAt,
          updatedAt: licDoc.updatedAt,
        },
        licenseType: {
          id: lt.id,
          name: lt.name,
          category: lt.category,
          requiresRenewal: lt.requiresRenewal,
          defaultWarnDays: lt.defaultWarnDays,
        },
        user: {
          id: licDoc.userId,
          name: licDoc.userName ?? null,
          orgUnitId: licDoc.userOrgUnitId ?? null,
        },
      });
    }

    return items;
  } catch (error) {
    console.error('[Licenses:Firestore] getByUserId error:', error);
    return [];
  }
}

// ========== 更新履歴 ==========

export async function getRenewalHistory(userLicenseId: string): Promise<LicenseRenewalEvent[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(RENEWAL_EVENTS_COLLECTION)
      .where('userLicenseId', '==', userLicenseId)
      .orderBy('createdAt', 'desc')
      .get();

    return snap.docs.map((d) => docToRenewalEvent(d)!).filter(Boolean);
  } catch (error) {
    console.error('[Licenses:Firestore] getRenewalHistory error:', error);
    return [];
  }
}
