/**
 * オンボーディング統計
 *
 * Ticket 097: 署名完了率ダッシュボード
 *
 * - 全体完了率
 * - 文書別署名率
 * - 組織別完了率
 * - 滞留バケット
 * - 未完了ユーザー上位
 */

import type { AppRole } from '@/config/appRoles';
import { getAllUserOnboardings, listRequirements } from './repo';
import { getUserById, listUsers } from '@/lib/roles/user-store';
import { getUserOrgContext, listOrgUnits } from '@/lib/org/repo';
import { isOnboardingTargetRole } from './types';
import type { UserOnboarding, UserRequiredItem } from './types';

// ========== 型定義 ==========

export interface OnboardingOverall {
  totalUsers: number;
  completedUsers: number;
  pendingUsers: number;
  completionRate: number;
}

export interface OnboardingByDoc {
  documentVersionId: string;
  documentId: string;
  title: string;
  signedCount: number;
  pendingCount: number;
  totalCount: number;
  signRate: number;
}

export interface OnboardingByOrgUnit {
  orgUnitId: string;
  orgUnitName: string;
  totalUsers: number;
  completedUsers: number;
  pendingUsers: number;
  completionRate: number;
  topPendingDocs: Array<{ documentVersionId: string; title: string; count: number }>;
}

export interface OnboardingAgingBuckets {
  oneDay: number;     // 1日以上
  threeDays: number;  // 3日以上
  sevenDays: number;  // 7日以上
}

export interface PendingUserInfo {
  userId: string;
  name: string | null;
  role: AppRole | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  pendingCount: number;
  oldestDays: number;
}

export interface OnboardingStats {
  generatedAt: string;
  overall: OnboardingOverall;
  byDoc: OnboardingByDoc[];
  byOrgUnit: OnboardingByOrgUnit[];
  agingBuckets: OnboardingAgingBuckets;
  topPendingUsers: PendingUserInfo[];
}

// ========== ユーティリティ ==========

/**
 * 日付からの経過日数を計算
 */
function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * 最も古い未署名アイテムの日数を取得
 */
function getOldestPendingDays(onboarding: UserOnboarding): number {
  // createdAt を基準に計算（signedAt が無いアイテム）
  const pendingItems = onboarding.requiredItems.filter((i) => i.status === 'pending');
  if (pendingItems.length === 0) return 0;

  // オンボーディングの作成日を基準
  return daysSince(onboarding.createdAt);
}

// ========== メイン関数 ==========

export interface ComputeStatsOptions {
  /** スコープとなる orgUnitIds（manager用） */
  scopeOrgUnitIds?: string[];
  /** PIIマスク（name を伏せる） */
  maskPII?: boolean;
}

/**
 * オンボーディング統計を計算
 */
export function computeOnboardingStats(options: ComputeStatsOptions = {}): OnboardingStats {
  const { scopeOrgUnitIds, maskPII = false } = options;
  const timestamp = new Date().toISOString();

  // 全ユーザーオンボーディングを取得
  let allOnboardings = getAllUserOnboardings();

  // オンボーディング対象ユーザーのみ抽出（staff/leader）
  const targetOnboardings: Array<{
    onboarding: UserOnboarding;
    user: { id: string; name: string; role: AppRole } | null;
    orgUnitId: string | null;
    orgUnitName: string | null;
  }> = [];

  for (const ob of allOnboardings) {
    const user = getUserById(ob.userId);
    if (!user) continue;
    if (!isOnboardingTargetRole(user.role)) continue;

    // 組織情報を取得
    const orgContext = getUserOrgContext(ob.userId);
    const primaryOrgUnitId = orgContext.primaryOrgUnitId;
    const primaryOrgUnitName = orgContext.primaryOrgUnit?.name ?? null;

    // スコープフィルター
    if (scopeOrgUnitIds && scopeOrgUnitIds.length > 0) {
      // ユーザーの所属組織がスコープに含まれるかチェック
      const userOrgIds = orgContext.orgUnitIds;
      const inScope = userOrgIds.some((id) => scopeOrgUnitIds.includes(id));
      if (!inScope) continue;
    }

    targetOnboardings.push({
      onboarding: ob,
      user: { id: user.id, name: user.name, role: user.role },
      orgUnitId: primaryOrgUnitId,
      orgUnitName: primaryOrgUnitName,
    });
  }

  // ========== 全体統計 ==========
  const totalUsers = targetOnboardings.length;
  const completedUsers = targetOnboardings.filter((t) => t.onboarding.status === 'completed').length;
  const pendingUsers = totalUsers - completedUsers;
  const completionRate = totalUsers > 0 ? Math.round((completedUsers / totalUsers) * 100) : 100;

  const overall: OnboardingOverall = {
    totalUsers,
    completedUsers,
    pendingUsers,
    completionRate,
  };

  // ========== 文書別統計 ==========
  const docStats = new Map<string, {
    documentVersionId: string;
    documentId: string;
    title: string;
    signed: number;
    pending: number;
  }>();

  for (const t of targetOnboardings) {
    for (const item of t.onboarding.requiredItems) {
      let stat = docStats.get(item.documentVersionId);
      if (!stat) {
        stat = {
          documentVersionId: item.documentVersionId,
          documentId: item.documentId,
          title: item.title,
          signed: 0,
          pending: 0,
        };
        docStats.set(item.documentVersionId, stat);
      }
      if (item.status === 'signed') {
        stat.signed++;
      } else {
        stat.pending++;
      }
    }
  }

  const byDoc: OnboardingByDoc[] = Array.from(docStats.values())
    .map((stat) => ({
      documentVersionId: stat.documentVersionId,
      documentId: stat.documentId,
      title: stat.title,
      signedCount: stat.signed,
      pendingCount: stat.pending,
      totalCount: stat.signed + stat.pending,
      signRate: stat.signed + stat.pending > 0
        ? Math.round((stat.signed / (stat.signed + stat.pending)) * 100)
        : 100,
    }))
    .sort((a, b) => a.signRate - b.signRate); // 署名率が低い順

  // ========== 組織別統計 ==========
  const orgStats = new Map<string, {
    orgUnitId: string;
    orgUnitName: string;
    completed: number;
    pending: number;
    pendingDocs: Map<string, { title: string; count: number }>;
  }>();

  // 組織リストを取得
  const orgUnits = listOrgUnits();
  for (const org of orgUnits) {
    orgStats.set(org.id, {
      orgUnitId: org.id,
      orgUnitName: org.name,
      completed: 0,
      pending: 0,
      pendingDocs: new Map(),
    });
  }

  for (const t of targetOnboardings) {
    if (!t.orgUnitId) continue;

    let stat = orgStats.get(t.orgUnitId);
    if (!stat) {
      stat = {
        orgUnitId: t.orgUnitId,
        orgUnitName: t.orgUnitName ?? t.orgUnitId,
        completed: 0,
        pending: 0,
        pendingDocs: new Map(),
      };
      orgStats.set(t.orgUnitId, stat);
    }

    if (t.onboarding.status === 'completed') {
      stat.completed++;
    } else {
      stat.pending++;
      // 未署名文書をカウント
      for (const item of t.onboarding.requiredItems) {
        if (item.status === 'pending') {
          const docStat = stat.pendingDocs.get(item.documentVersionId);
          if (docStat) {
            docStat.count++;
          } else {
            stat.pendingDocs.set(item.documentVersionId, {
              title: item.title,
              count: 1,
            });
          }
        }
      }
    }
  }

  const byOrgUnit: OnboardingByOrgUnit[] = Array.from(orgStats.values())
    .filter((stat) => stat.completed + stat.pending > 0) // ユーザーがいる組織のみ
    .map((stat) => {
      const total = stat.completed + stat.pending;
      // 上位2件の未署名文書
      const topPendingDocs = Array.from(stat.pendingDocs.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 2)
        .map((d) => ({
          documentVersionId: Array.from(stat.pendingDocs.entries())
            .find(([, v]) => v === d)?.[0] ?? '',
          title: d.title,
          count: d.count,
        }));

      return {
        orgUnitId: stat.orgUnitId,
        orgUnitName: stat.orgUnitName,
        totalUsers: total,
        completedUsers: stat.completed,
        pendingUsers: stat.pending,
        completionRate: total > 0 ? Math.round((stat.completed / total) * 100) : 100,
        topPendingDocs,
      };
    })
    .sort((a, b) => a.completionRate - b.completionRate); // 完了率が低い順

  // ========== 滞留バケット ==========
  let oneDay = 0;
  let threeDays = 0;
  let sevenDays = 0;

  for (const t of targetOnboardings) {
    if (t.onboarding.status === 'pending') {
      const days = getOldestPendingDays(t.onboarding);
      if (days >= 1) oneDay++;
      if (days >= 3) threeDays++;
      if (days >= 7) sevenDays++;
    }
  }

  const agingBuckets: OnboardingAgingBuckets = {
    oneDay,
    threeDays,
    sevenDays,
  };

  // ========== 未完了ユーザー上位 ==========
  const pendingUserInfos: PendingUserInfo[] = targetOnboardings
    .filter((t) => t.onboarding.status === 'pending')
    .map((t) => {
      const pendingItems = t.onboarding.requiredItems.filter((i) => i.status === 'pending');
      return {
        userId: t.onboarding.userId,
        name: maskPII ? null : (t.user?.name ?? null),
        role: t.user?.role ?? null,
        orgUnitId: t.orgUnitId,
        orgUnitName: t.orgUnitName,
        pendingCount: pendingItems.length,
        oldestDays: getOldestPendingDays(t.onboarding),
      };
    })
    .sort((a, b) => b.oldestDays - a.oldestDays) // 滞留日数が長い順
    .slice(0, 20); // 最大20件

  return {
    generatedAt: timestamp,
    overall,
    byDoc,
    byOrgUnit,
    agingBuckets,
    topPendingUsers: pendingUserInfos,
  };
}

/**
 * manager のスコープ orgUnitIds を取得
 */
export function getManagerScopeOrgUnitIds(userId: string): string[] {
  const orgContext = getUserOrgContext(userId);
  // manager は自分が manager/approver の組織を管理可能
  return orgContext.managerOfOrgUnitIds;
}
