/**
 * オンボーディング未完了ユーザースキャン
 *
 * Ticket 095: 未署名放置の自動リマインド
 *
 * 処理:
 * - user_onboarding で status='pending' のユーザーを抽出
 * - pendingDays を計算
 * - escalation 条件を判定
 */

import type { AppRole } from '@/config/appRoles';
import type { UserOnboarding } from './types';

// ========== 型定義 ==========

/**
 * 未完了ユーザー情報
 */
export interface PendingUser {
  userId: string;
  role: AppRole;
  orgUnitIds: string[];
  pendingCount: number;
  signedCount: number;
  totalCount: number;
  oldestPendingDays: number;
  onboarding: UserOnboarding;
  escalationLevel: 'normal' | 'warning' | 'critical';
}

/**
 * スキャン結果
 */
export interface ScanPendingResult {
  pendingUsers: PendingUser[];
  totalPendingCount: number;
  warningCount: number;
  criticalCount: number;
  scanTime: string;
}

// ========== 設定 ==========

/**
 * Escalation 閾値（日数）
 */
export const ESCALATION_THRESHOLDS = {
  warning: 3,   // 3日以上で warning
  critical: 7,  // 7日以上で critical
} as const;

// ========== ユーティリティ ==========

/**
 * 日数を計算
 */
function daysSince(isoDate: string): number {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Escalation レベルを判定
 */
function getEscalationLevel(pendingDays: number): 'normal' | 'warning' | 'critical' {
  if (pendingDays >= ESCALATION_THRESHOLDS.critical) {
    return 'critical';
  }
  if (pendingDays >= ESCALATION_THRESHOLDS.warning) {
    return 'warning';
  }
  return 'normal';
}

// ========== スキャン関数 ==========

/**
 * 未完了ユーザーをスキャン
 *
 * @param getAllUserOnboardings - 全ユーザーのオンボーディング情報を取得する関数
 * @param getUserInfo - ユーザー情報を取得する関数
 */
export function scanPendingUsers(
  getAllUserOnboardings: () => UserOnboarding[],
  getUserInfo: (userId: string) => { role: AppRole; orgUnitIds: string[] } | null
): ScanPendingResult {
  const allOnboardings = getAllUserOnboardings();
  const pendingUsers: PendingUser[] = [];

  for (const onboarding of allOnboardings) {
    // pending 状態のみ対象
    if (onboarding.status !== 'pending') {
      continue;
    }

    // pending アイテムがあるかチェック
    const pendingItems = onboarding.requiredItems.filter((i) => i.status === 'pending');
    if (pendingItems.length === 0) {
      continue;
    }

    // ユーザー情報を取得
    const userInfo = getUserInfo(onboarding.userId);
    if (!userInfo) {
      continue;
    }

    // 最も古い pending 日数を計算
    const baseDate = onboarding.appliedAt || onboarding.createdAt;
    const oldestPendingDays = daysSince(baseDate);

    // Escalation レベルを判定
    const escalationLevel = getEscalationLevel(oldestPendingDays);

    pendingUsers.push({
      userId: onboarding.userId,
      role: userInfo.role,
      orgUnitIds: userInfo.orgUnitIds,
      pendingCount: pendingItems.length,
      signedCount: onboarding.requiredItems.filter((i) => i.status === 'signed').length,
      totalCount: onboarding.requiredItems.length,
      oldestPendingDays,
      onboarding,
      escalationLevel,
    });
  }

  // 統計
  const warningCount = pendingUsers.filter((u) => u.escalationLevel === 'warning').length;
  const criticalCount = pendingUsers.filter((u) => u.escalationLevel === 'critical').length;

  return {
    pendingUsers,
    totalPendingCount: pendingUsers.length,
    warningCount,
    criticalCount,
    scanTime: new Date().toISOString(),
  };
}

/**
 * orgUnit 別に未完了者を集計
 */
export function groupByOrgUnit(
  pendingUsers: PendingUser[]
): Map<string, PendingUser[]> {
  const grouped = new Map<string, PendingUser[]>();

  for (const user of pendingUsers) {
    for (const orgUnitId of user.orgUnitIds) {
      const existing = grouped.get(orgUnitId) ?? [];
      existing.push(user);
      grouped.set(orgUnitId, existing);
    }
    // orgUnit がない場合は 'unassigned' グループ
    if (user.orgUnitIds.length === 0) {
      const existing = grouped.get('unassigned') ?? [];
      existing.push(user);
      grouped.set('unassigned', existing);
    }
  }

  return grouped;
}

/**
 * role 別に未完了者を集計
 */
export function groupByRole(
  pendingUsers: PendingUser[]
): Map<AppRole, PendingUser[]> {
  const grouped = new Map<AppRole, PendingUser[]>();

  for (const user of pendingUsers) {
    const existing = grouped.get(user.role) ?? [];
    existing.push(user);
    grouped.set(user.role, existing);
  }

  return grouped;
}
