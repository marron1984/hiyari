/**
 * 修繕管理（Repairs）リポジトリ
 *
 * インメモリストア実装
 * Task 030: businessUnitId によるスコープ対応
 */

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

// ========== ストレージ ==========

const repairsStore = new Map<string, RepairRecord>();
let idCounter = 1;

// ========== ユーティリティ ==========

function generateId(): string {
  return `repair_${String(idCounter++).padStart(4, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

const DEMO_USERS: Record<string, string> = {
  user_001: '山田太郎',
  user_002: '佐藤次郎',
  user_003: '鈴木花子',
};

function getUserName(userId: string): string {
  return DEMO_USERS[userId] ?? userId;
}

function isOverdue(repair: RepairRecord): boolean {
  if (!repair.dueAt) return false;
  if (['completed', 'cancelled'].includes(repair.status)) return false;
  return new Date(repair.dueAt) < new Date();
}

// ========== 一覧取得 ==========

export function listRepairs(
  viewer: ViewerContext,
  filter: RepairListFilter
): { repairs: RepairRecord[]; total: number } {
  let repairs = Array.from(repairsStore.values());

  // RBAC
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    repairs = repairs.filter((r) => canViewRepair(r, viewer));
  }

  // Task 030: 事業単位フィルタ
  if (filter.businessUnitId !== undefined) {
    if (filter.businessUnitId === null) {
      repairs = repairs.filter((r) => r.businessUnitId === null);
    } else {
      repairs = repairs.filter((r) => r.businessUnitId === filter.businessUnitId);
    }
  }

  // ステータスフィルタ
  if (filter.status) {
    repairs = repairs.filter((r) => r.status === filter.status);
  }

  // カテゴリフィルタ
  if (filter.category) {
    repairs = repairs.filter((r) => r.category === filter.category);
  }

  // 安全リスクフィルタ
  if (filter.safetyRisk) {
    repairs = repairs.filter((r) => r.safetyRisk === filter.safetyRisk);
  }

  // 期限超過フィルタ
  if (filter.overdue) {
    repairs = repairs.filter(isOverdue);
  }

  // 検索
  if (filter.q) {
    const q = filter.q.toLowerCase();
    repairs = repairs.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.location && r.location.toLowerCase().includes(q))
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

export function getRepairById(
  id: string,
  viewer: ViewerContext
): { success: true; repair: RepairRecord } | { success: false; error: string } {
  const repair = repairsStore.get(id);
  if (!repair) {
    return { success: false, error: '修繕記録が見つかりません' };
  }
  if (!canViewRepair(repair, viewer)) {
    return { success: false, error: '閲覧権限がありません' };
  }
  return { success: true, repair };
}

// ========== 作成 ==========

export function createRepair(
  input: CreateRepairRequest,
  actorUserId: string
): RepairRecord {
  const timestamp = now();
  const repair: RepairRecord = {
    id: generateId(),
    title: input.title,
    description: input.description,
    status: 'reported',
    category: input.category ?? 'other',
    safetyRisk: input.safetyRisk ?? 'low',
    businessUnitId: input.businessUnitId ?? null,
    location: input.location ?? null,
    reportedByUserId: actorUserId,
    reportedByUserName: getUserName(actorUserId),
    assignedVendor: null,
    estimatedCost: null,
    actualCost: null,
    scheduledAt: null,
    completedAt: null,
    dueAt: input.dueAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  repairsStore.set(repair.id, repair);
  return repair;
}

// ========== 更新 ==========

export function updateRepair(
  id: string,
  patch: UpdateRepairRequest,
  viewer: ViewerContext
): { success: true; repair: RepairRecord } | { success: false; error: string } {
  const repair = repairsStore.get(id);
  if (!repair) {
    return { success: false, error: '修繕記録が見つかりません' };
  }
  if (!canManageRepair(viewer)) {
    return { success: false, error: '更新権限がありません' };
  }

  const updated: RepairRecord = {
    ...repair,
    ...patch,
    updatedAt: now(),
  };

  repairsStore.set(id, updated);
  return { success: true, repair: updated };
}

// ========== ステータス変更 ==========

export function changeRepairStatus(
  id: string,
  newStatus: RepairStatus,
  viewer: ViewerContext
): { success: true; repair: RepairRecord } | { success: false; error: string } {
  const repair = repairsStore.get(id);
  if (!repair) {
    return { success: false, error: '修繕記録が見つかりません' };
  }
  if (!canManageRepair(viewer)) {
    return { success: false, error: 'ステータス変更権限がありません' };
  }

  repair.status = newStatus;
  repair.updatedAt = now();

  if (newStatus === 'completed') {
    repair.completedAt = repair.updatedAt;
  }

  return { success: true, repair };
}

// ========== 統計 ==========

export interface RepairStatsOptions {
  businessUnitId?: string | null;
}

export function getStats(
  viewer: ViewerContext,
  options?: RepairStatsOptions
): RepairStats {
  let repairs = Array.from(repairsStore.values());

  // RBAC
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    repairs = repairs.filter((r) => canViewRepair(r, viewer));
  }

  // Task 030: 事業単位フィルタ
  if (options?.businessUnitId !== undefined) {
    if (options.businessUnitId === null) {
      repairs = repairs.filter((r) => r.businessUnitId === null);
    } else {
      repairs = repairs.filter((r) => r.businessUnitId === options.businessUnitId);
    }
  }

  const openStatuses: RepairStatus[] = ['reported', 'assessing', 'scheduled', 'in_progress'];
  const openRepairs = repairs.filter((r) => openStatuses.includes(r.status));
  const highRiskOpen = openRepairs.filter((r) => r.safetyRisk === 'high').length;
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
          completedWithDuration.reduce((a, b) => a + b, 0) / completedWithDuration.length
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

export function scanHighRiskOpen(): RepairRecord[] {
  const openStatuses: RepairStatus[] = ['reported', 'assessing', 'scheduled', 'in_progress'];
  return Array.from(repairsStore.values()).filter(
    (r) => openStatuses.includes(r.status) && r.safetyRisk === 'high'
  );
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (repairsStore.size > 0) return;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const repairs: Omit<RepairRecord, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      title: '非常口の照明故障',
      description: '2階非常口の誘導灯が点灯しなくなっています。緊急対応が必要です。',
      status: 'reported',
      category: 'electrical',
      safetyRisk: 'high',
      businessUnitId: 'bu_003',        // サ高住
      location: '2階非常口',
      reportedByUserId: 'user_001',
      reportedByUserName: '山田太郎',
      assignedVendor: null,
      estimatedCost: null,
      actualCost: null,
      scheduledAt: null,
      completedAt: null,
      dueAt: yesterday.toISOString(),
    },
    {
      title: '1階トイレの水漏れ',
      description: '1階共用トイレの給水管から微量の水漏れが発生しています。',
      status: 'assessing',
      category: 'plumbing',
      safetyRisk: 'medium',
      businessUnitId: 'bu_001',        // 西淀川
      location: '1階共用トイレ',
      reportedByUserId: 'user_002',
      reportedByUserName: '佐藤次郎',
      assignedVendor: '設備メンテナンス株式会社',
      estimatedCost: 50000,
      actualCost: null,
      scheduledAt: tomorrow.toISOString(),
      completedAt: null,
      dueAt: nextWeek.toISOString(),
    },
    {
      title: '3階エアコン不調',
      description: '3階東側のエアコンが冷房モードで動作しません。',
      status: 'scheduled',
      category: 'hvac',
      safetyRisk: 'low',
      businessUnitId: 'bu_003',        // サ高住
      location: '3階東側',
      reportedByUserId: 'user_003',
      reportedByUserName: '鈴木花子',
      assignedVendor: '空調サービス',
      estimatedCost: 30000,
      actualCost: null,
      scheduledAt: nextWeek.toISOString(),
      completedAt: null,
      dueAt: null,
    },
    {
      title: '駐車場の照明交換',
      description: '駐車場の外灯が3箇所切れています。',
      status: 'completed',
      category: 'electrical',
      safetyRisk: 'low',
      businessUnitId: 'bu_002',        // 東淀川
      location: '駐車場',
      reportedByUserId: 'user_001',
      reportedByUserName: '山田太郎',
      assignedVendor: '電気工事会社',
      estimatedCost: 15000,
      actualCost: 12000,
      scheduledAt: twoDaysAgo.toISOString(),
      completedAt: yesterday.toISOString(),
      dueAt: null,
    },
  ];

  repairs.forEach((r) => {
    const repair: RepairRecord = {
      ...r,
      id: generateId(),
      createdAt: twoDaysAgo.toISOString(),
      updatedAt: now.toISOString(),
    };
    repairsStore.set(repair.id, repair);
  });
}

initDemoData();
