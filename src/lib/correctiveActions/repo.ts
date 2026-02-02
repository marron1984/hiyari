/**
 * 是正措置（Corrective Actions）リポジトリ
 *
 * インメモリストア実装
 * Task 030: businessUnitId によるスコープ対応
 */

import type {
  CorrectiveAction,
  CorrectiveActionStatus,
  CorrectiveActionSeverity,
  CorrectiveActionListFilter,
  CorrectiveActionStats,
  CreateCorrectiveActionRequest,
  UpdateCorrectiveActionRequest,
  ViewerContext,
} from './types';
import { canViewCorrectiveAction, canManageCorrectiveAction } from './types';

// ========== ストレージ ==========

const caStore = new Map<string, CorrectiveAction>();
let idCounter = 1;

// ========== ユーティリティ ==========

function generateId(): string {
  return `ca_${String(idCounter++).padStart(4, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

const DEMO_USERS: Record<string, string> = {
  user_001: '山田太郎',
  user_002: '佐藤次郎',
  user_003: '鈴木花子',
  user_manager: '田中管理者',
};

function getUserName(userId: string): string {
  return DEMO_USERS[userId] ?? userId;
}

function isOverdue(ca: CorrectiveAction): boolean {
  if (!ca.dueAt) return false;
  if (['completed', 'closed', 'cancelled'].includes(ca.status)) return false;
  return new Date(ca.dueAt) < new Date();
}

// ========== 一覧取得 ==========

export function listCorrectiveActions(
  viewer: ViewerContext,
  filter: CorrectiveActionListFilter
): { items: CorrectiveAction[]; total: number } {
  let items = Array.from(caStore.values());

  // RBAC
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    items = items.filter((ca) => canViewCorrectiveAction(ca, viewer));
  }

  // Task 030: 事業単位フィルタ
  if (filter.businessUnitId !== undefined) {
    if (filter.businessUnitId === null) {
      items = items.filter((ca) => ca.businessUnitId === null);
    } else {
      items = items.filter((ca) => ca.businessUnitId === filter.businessUnitId);
    }
  }

  // ステータスフィルタ
  if (filter.status) {
    items = items.filter((ca) => ca.status === filter.status);
  }

  // 重要度フィルタ
  if (filter.severity) {
    items = items.filter((ca) => ca.severity === filter.severity);
  }

  // ソースタイプフィルタ
  if (filter.sourceType) {
    items = items.filter((ca) => ca.sourceType === filter.sourceType);
  }

  // 期限超過フィルタ
  if (filter.overdue) {
    items = items.filter(isOverdue);
  }

  // 検索
  if (filter.q) {
    const q = filter.q.toLowerCase();
    items = items.filter(
      (ca) =>
        ca.title.toLowerCase().includes(q) ||
        ca.description.toLowerCase().includes(q) ||
        (ca.rootCause && ca.rootCause.toLowerCase().includes(q))
    );
  }

  // ソート: severity (critical優先) → updatedAt降順
  const severityOrder: Record<CorrectiveActionSeverity, number> = {
    critical: 0,
    major: 1,
    minor: 2,
  };
  items.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const total = items.length;

  // ページネーション
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  items = items.slice(offset, offset + limit);

  return { items, total };
}

// ========== 詳細取得 ==========

export function getById(
  id: string,
  viewer: ViewerContext
): { success: true; item: CorrectiveAction } | { success: false; error: string } {
  const ca = caStore.get(id);
  if (!ca) {
    return { success: false, error: '是正措置が見つかりません' };
  }
  if (!canViewCorrectiveAction(ca, viewer)) {
    return { success: false, error: '閲覧権限がありません' };
  }
  return { success: true, item: ca };
}

// ========== 作成 ==========

export function create(
  input: CreateCorrectiveActionRequest,
  actorUserId: string
): CorrectiveAction {
  const timestamp = now();
  const ca: CorrectiveAction = {
    id: generateId(),
    title: input.title,
    description: input.description,
    status: 'open',
    severity: input.severity ?? 'minor',
    sourceType: input.sourceType ?? 'manual',
    sourceId: input.sourceId ?? null,
    businessUnitId: input.businessUnitId ?? null,
    rootCause: input.rootCause ?? null,
    actionPlan: input.actionPlan ?? null,
    ownerUserId: input.ownerUserId ?? null,
    ownerUserName: input.ownerUserId ? getUserName(input.ownerUserId) : null,
    createdByUserId: actorUserId,
    createdByUserName: getUserName(actorUserId),
    dueAt: input.dueAt ?? null,
    completedAt: null,
    verifiedAt: null,
    verifiedByUserId: null,
    verifiedByUserName: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  caStore.set(ca.id, ca);
  return ca;
}

// ========== 更新 ==========

export function update(
  id: string,
  patch: UpdateCorrectiveActionRequest,
  viewer: ViewerContext
): { success: true; item: CorrectiveAction } | { success: false; error: string } {
  const ca = caStore.get(id);
  if (!ca) {
    return { success: false, error: '是正措置が見つかりません' };
  }
  if (!canManageCorrectiveAction(viewer) && ca.ownerUserId !== viewer.userId) {
    return { success: false, error: '更新権限がありません' };
  }

  const updated: CorrectiveAction = {
    ...ca,
    ...patch,
    ownerUserName: patch.ownerUserId !== undefined
      ? (patch.ownerUserId ? getUserName(patch.ownerUserId) : null)
      : ca.ownerUserName,
    updatedAt: now(),
  };

  caStore.set(id, updated);
  return { success: true, item: updated };
}

// ========== ステータス変更 ==========

export function changeStatus(
  id: string,
  newStatus: CorrectiveActionStatus,
  viewer: ViewerContext
): { success: true; item: CorrectiveAction } | { success: false; error: string } {
  const ca = caStore.get(id);
  if (!ca) {
    return { success: false, error: '是正措置が見つかりません' };
  }
  if (!canManageCorrectiveAction(viewer) && ca.ownerUserId !== viewer.userId) {
    return { success: false, error: 'ステータス変更権限がありません' };
  }

  ca.status = newStatus;
  ca.updatedAt = now();

  if (newStatus === 'completed') {
    ca.completedAt = ca.updatedAt;
  }

  return { success: true, item: ca };
}

// ========== 検証（完了確認） ==========

export function verify(
  id: string,
  viewer: ViewerContext
): { success: true; item: CorrectiveAction } | { success: false; error: string } {
  const ca = caStore.get(id);
  if (!ca) {
    return { success: false, error: '是正措置が見つかりません' };
  }
  if (!canManageCorrectiveAction(viewer)) {
    return { success: false, error: '検証権限がありません' };
  }

  ca.verifiedAt = now();
  ca.verifiedByUserId = viewer.userId;
  ca.verifiedByUserName = getUserName(viewer.userId);
  ca.status = 'closed';
  ca.updatedAt = ca.verifiedAt;

  return { success: true, item: ca };
}

// ========== 統計 ==========

export interface CorrectiveActionStatsOptions {
  businessUnitId?: string | null;
}

export function getStats(
  viewer: ViewerContext,
  options?: CorrectiveActionStatsOptions
): CorrectiveActionStats {
  let items = Array.from(caStore.values());

  // RBAC
  if (!['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    items = items.filter((ca) => canViewCorrectiveAction(ca, viewer));
  }

  // Task 030: 事業単位フィルタ
  if (options?.businessUnitId !== undefined) {
    if (options.businessUnitId === null) {
      items = items.filter((ca) => ca.businessUnitId === null);
    } else {
      items = items.filter((ca) => ca.businessUnitId === options.businessUnitId);
    }
  }

  const openStatuses: CorrectiveActionStatus[] = ['open', 'in_progress', 'pending_review'];
  const openItems = items.filter((ca) => openStatuses.includes(ca.status));
  const criticalOpen = openItems.filter((ca) => ca.severity === 'critical').length;
  const overdueCount = items.filter(isOverdue).length;

  // 今月完了
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const completedThisMonth = items.filter(
    (ca) => ca.completedAt && new Date(ca.completedAt) >= monthStart
  ).length;

  // 平均完了日数
  const completedWithDuration = items
    .filter((ca) => ca.completedAt)
    .map((ca) => {
      const created = new Date(ca.createdAt).getTime();
      const completed = new Date(ca.completedAt!).getTime();
      return (completed - created) / (1000 * 60 * 60 * 24);
    });

  const avgCompletionDays =
    completedWithDuration.length > 0
      ? Math.round(
          completedWithDuration.reduce((a, b) => a + b, 0) / completedWithDuration.length
        )
      : null;

  return {
    total: items.length,
    open: openItems.length,
    criticalOpen,
    overdue: overdueCount,
    completedThisMonth,
    avgCompletionDays,
  };
}

// ========== 重大オープンスキャン ==========

export function scanCriticalOpen(): CorrectiveAction[] {
  const openStatuses: CorrectiveActionStatus[] = ['open', 'in_progress', 'pending_review'];
  return Array.from(caStore.values()).filter(
    (ca) => openStatuses.includes(ca.status) && ca.severity === 'critical'
  );
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (caStore.size > 0) return;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const items: Omit<CorrectiveAction, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      title: '転倒事故防止策の徹底',
      description: '2F廊下での転倒事故を受け、手すり設置と巡回強化を実施する。',
      status: 'in_progress',
      severity: 'critical',
      sourceType: 'incident',
      sourceId: 'inc_001',
      businessUnitId: 'bu_003',        // サ高住
      rootCause: '廊下の手すりが一部未設置だった',
      actionPlan: '1. 手すり追加設置（3日以内）\n2. 巡回頻度を15分間隔に変更',
      ownerUserId: 'user_manager',
      ownerUserName: '田中管理者',
      createdByUserId: 'user_001',
      createdByUserName: '山田太郎',
      dueAt: yesterday.toISOString(),
      completedAt: null,
      verifiedAt: null,
      verifiedByUserId: null,
      verifiedByUserName: null,
    },
    {
      title: '服薬確認手順の見直し',
      description: 'ご家族からのクレームを受け、服薬確認手順を見直す。',
      status: 'open',
      severity: 'major',
      sourceType: 'complaint',
      sourceId: 'cmp_002',
      businessUnitId: 'bu_001',        // 西淀川
      rootCause: 'ダブルチェック体制が不十分だった',
      actionPlan: '服薬チェックリストの改定と研修実施',
      ownerUserId: 'user_002',
      ownerUserName: '佐藤次郎',
      createdByUserId: 'user_003',
      createdByUserName: '鈴木花子',
      dueAt: nextWeek.toISOString(),
      completedAt: null,
      verifiedAt: null,
      verifiedByUserId: null,
      verifiedByUserName: null,
    },
    {
      title: '記録書類の保管方法改善',
      description: '監査指摘を受け、記録書類の保管方法を改善する。',
      status: 'completed',
      severity: 'minor',
      sourceType: 'audit',
      sourceId: null,
      businessUnitId: 'bu_002',        // 東淀川
      rootCause: 'ファイリングルールが曖昧だった',
      actionPlan: '書類保管マニュアルを作成し、全スタッフに周知',
      ownerUserId: 'user_003',
      ownerUserName: '鈴木花子',
      createdByUserId: 'user_manager',
      createdByUserName: '田中管理者',
      dueAt: twoDaysAgo.toISOString(),
      completedAt: yesterday.toISOString(),
      verifiedAt: null,
      verifiedByUserId: null,
      verifiedByUserName: null,
    },
    {
      title: '委員会議事録フォーマット統一',
      description: '安全委員会からの提案で、議事録フォーマットを統一する。',
      status: 'pending_review',
      severity: 'minor',
      sourceType: 'committee',
      sourceId: 'com_001',
      businessUnitId: 'bu_corp',       // 法人本部
      rootCause: '各事業所でフォーマットがバラバラだった',
      actionPlan: '標準フォーマットを作成し、テンプレートとして配布',
      ownerUserId: 'user_001',
      ownerUserName: '山田太郎',
      createdByUserId: 'user_002',
      createdByUserName: '佐藤次郎',
      dueAt: tomorrow.toISOString(),
      completedAt: now.toISOString(),
      verifiedAt: null,
      verifiedByUserId: null,
      verifiedByUserName: null,
    },
  ];

  items.forEach((item) => {
    const ca: CorrectiveAction = {
      ...item,
      id: generateId(),
      createdAt: twoDaysAgo.toISOString(),
      updatedAt: now.toISOString(),
    };
    caStore.set(ca.id, ca);
  });
}

initDemoData();
