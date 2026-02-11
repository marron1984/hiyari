/**
 * 修繕管理（Repairs）Firestoreリポジトリ
 *
 * PROD-003: 本番永続化
 * Task 030: businessUnitId によるスコープ対応
 *
 * コレクション: repairs
 *
 * 対応関数:
 * - listRepairs: 一覧取得
 * - getRepairById: 詳細取得
 * - createRepair: 作成
 * - updateRepair: 更新
 * - changeRepairStatus: ステータス変更
 * - getStats: 統計
 * - scanHighRiskOpen: 高リスクオープンスキャン
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  RepairRecord,
  RepairStatus,
  RepairListFilter,
  RepairStats,
  CreateRepairRequest,
  UpdateRepairRequest,
  ViewerContext,
  SafetyRisk,
} from './types';
import { canViewRepair, canManageRepair } from './types';

// ========== 定数 ==========

const REPAIRS_COLLECTION = 'repairs';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function isOverdue(repair: RepairRecord): boolean {
  if (!repair.dueAt) return false;
  if (['completed', 'cancelled'].includes(repair.status)) return false;
  return new Date(repair.dueAt) < new Date();
}

function docToRepair(
  doc: FirebaseFirestore.DocumentSnapshot
): RepairRecord {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    title: data.title ?? '',
    description: data.description ?? '',
    status: data.status ?? 'reported',
    category: data.category ?? 'other',
    safetyRisk: data.safetyRisk ?? 'low',
    businessUnitId: data.businessUnitId ?? null,
    location: data.location ?? null,
    reportedByUserId: data.reportedByUserId ?? '',
    reportedByUserName: data.reportedByUserName,
    assignedVendor: data.assignedVendor ?? null,
    estimatedCost: data.estimatedCost ?? null,
    actualCost: data.actualCost ?? null,
    scheduledAt: data.scheduledAt ?? null,
    completedAt: data.completedAt ?? null,
    dueAt: data.dueAt ?? null,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

// ========== 一覧取得 ==========

export async function listRepairs(
  viewer: ViewerContext,
  filter: RepairListFilter
): Promise<{ repairs: RepairRecord[]; total: number }> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(REPAIRS_COLLECTION);

  // Firestoreクエリで可能なフィルタ
  if (filter.businessUnitId !== undefined) {
    if (filter.businessUnitId === null) {
      q = q.where('businessUnitId', '==', null);
    } else {
      q = q.where('businessUnitId', '==', filter.businessUnitId);
    }
  }

  if (filter.status) {
    q = q.where('status', '==', filter.status);
  }

  if (filter.category) {
    q = q.where('category', '==', filter.category);
  }

  if (filter.safetyRisk) {
    q = q.where('safetyRisk', '==', filter.safetyRisk);
  }

  const snap = await q.get();
  let repairs = snap.docs.map(docToRepair);

  // RBAC
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    repairs = repairs.filter((r) => canViewRepair(r, viewer));
  }

  // 期限超過フィルタ
  if (filter.overdue) {
    repairs = repairs.filter(isOverdue);
  }

  // 検索（メモリ内）
  if (filter.q) {
    const searchTerm = filter.q.toLowerCase();
    repairs = repairs.filter(
      (r) =>
        r.title.toLowerCase().includes(searchTerm) ||
        r.description.toLowerCase().includes(searchTerm) ||
        (r.location && r.location.toLowerCase().includes(searchTerm))
    );
  }

  // ソート: safetyRisk (high優先) → updatedAt降順
  const riskOrder: Record<SafetyRisk, number> = {
    high: 0,
    medium: 1,
    low: 2,
    none: 3,
  };
  repairs.sort((a, b) => {
    const riskDiff = riskOrder[a.safetyRisk] - riskOrder[b.safetyRisk];
    if (riskDiff !== 0) return riskDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const total = repairs.length;

  // ページネーション
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  repairs = repairs.slice(offset, offset + limit);

  return { repairs, total };
}

// ========== 詳細取得 ==========

export async function getRepairById(
  id: string,
  viewer: ViewerContext
): Promise<
  { success: true; repair: RepairRecord } | { success: false; error: string }
> {
  const db = getAdminDb();
  const doc = await db.collection(REPAIRS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return { success: false, error: '修繕記録が見つかりません' };
  }

  const repair = docToRepair(doc);
  if (!canViewRepair(repair, viewer)) {
    return { success: false, error: '閲覧権限がありません' };
  }

  return { success: true, repair };
}

// ========== 作成 ==========

export async function createRepair(
  input: CreateRepairRequest,
  actorUserId: string
): Promise<RepairRecord> {
  const db = getAdminDb();
  const docRef = db.collection(REPAIRS_COLLECTION).doc();
  const timestamp = now();

  const repair: RepairRecord = {
    id: docRef.id,
    title: input.title,
    description: input.description,
    status: 'reported',
    category: input.category ?? 'other',
    safetyRisk: input.safetyRisk ?? 'low',
    businessUnitId: input.businessUnitId ?? null,
    location: input.location ?? null,
    reportedByUserId: actorUserId,
    reportedByUserName: undefined,
    assignedVendor: null,
    estimatedCost: null,
    actualCost: null,
    scheduledAt: null,
    completedAt: null,
    dueAt: input.dueAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await docRef.set(repair);
  return repair;
}

// ========== 更新 ==========

export async function updateRepair(
  id: string,
  patch: UpdateRepairRequest,
  viewer: ViewerContext
): Promise<
  { success: true; repair: RepairRecord } | { success: false; error: string }
> {
  const db = getAdminDb();
  const docRef = db.collection(REPAIRS_COLLECTION).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '修繕記録が見つかりません' };
  }

  if (!canManageRepair(viewer)) {
    return { success: false, error: '更新権限がありません' };
  }

  await docRef.update({
    ...patch,
    updatedAt: now(),
  });

  const updatedDoc = await docRef.get();
  return { success: true, repair: docToRepair(updatedDoc) };
}

// ========== ステータス変更 ==========

export async function changeRepairStatus(
  id: string,
  newStatus: RepairStatus,
  viewer: ViewerContext
): Promise<
  { success: true; repair: RepairRecord } | { success: false; error: string }
> {
  const db = getAdminDb();
  const docRef = db.collection(REPAIRS_COLLECTION).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '修繕記録が見つかりません' };
  }

  if (!canManageRepair(viewer)) {
    return { success: false, error: 'ステータス変更権限がありません' };
  }

  const timestamp = now();
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedAt: timestamp,
  };

  if (newStatus === 'completed') {
    updateData.completedAt = timestamp;
  }

  await docRef.update(updateData);

  const updatedDoc = await docRef.get();
  return { success: true, repair: docToRepair(updatedDoc) };
}

// ========== 統計 ==========

export interface RepairStatsOptions {
  businessUnitId?: string | null;
}

export async function getStats(
  viewer: ViewerContext,
  options?: RepairStatsOptions
): Promise<RepairStats> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(REPAIRS_COLLECTION);

  // Task 030: 事業単位フィルタ
  if (options?.businessUnitId !== undefined) {
    if (options.businessUnitId === null) {
      q = q.where('businessUnitId', '==', null);
    } else {
      q = q.where('businessUnitId', '==', options.businessUnitId);
    }
  }

  const snap = await q.get();
  let repairs = snap.docs.map(docToRepair);

  // RBAC
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    repairs = repairs.filter((r) => canViewRepair(r, viewer));
  }

  const openStatuses: RepairStatus[] = [
    'reported',
    'assessing',
    'scheduled',
    'in_progress',
  ];
  const openRepairs = repairs.filter((r) => openStatuses.includes(r.status));
  const highRiskOpen = openRepairs.filter(
    (r) => r.safetyRisk === 'high'
  ).length;
  const overdueCount = repairs.filter(isOverdue).length;

  // 今月完了
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const completedThisMonth = repairs.filter(
    (r) => r.completedAt && new Date(r.completedAt) >= monthStart
  ).length;

  // 平均完了日数
  const completedWithDuration = repairs
    .filter((r) => r.completedAt)
    .map((r) => {
      const created = new Date(r.createdAt).getTime();
      const completed = new Date(r.completedAt!).getTime();
      return (completed - created) / (1000 * 60 * 60 * 24);
    });

  const avgCompletionDays =
    completedWithDuration.length > 0
      ? Math.round(
          completedWithDuration.reduce((a, b) => a + b, 0) /
            completedWithDuration.length
        )
      : null;

  return {
    total: repairs.length,
    open: openRepairs.length,
    highRiskOpen,
    overdue: overdueCount,
    completedThisMonth,
    avgCompletionDays,
  };
}

// ========== 高リスクオープンスキャン ==========

export async function scanHighRiskOpen(): Promise<RepairRecord[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(REPAIRS_COLLECTION)
    .where('safetyRisk', '==', 'high')
    .get();

  const openStatuses: RepairStatus[] = [
    'reported',
    'assessing',
    'scheduled',
    'in_progress',
  ];
  return snap.docs
    .map(docToRepair)
    .filter((r) => openStatuses.includes(r.status));
}
