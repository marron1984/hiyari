/**
 * オンボーディング未完了リマインド
 *
 * Ticket 095: 未署名放置の自動リマインド
 *
 * 処理:
 * - 本人通知（1日1回）
 * - manager/admin ダイジェスト通知
 * - escalation 通知（warning/critical）
 */

import type { AppRole } from '@/config/appRoles';
import * as notificationRepo from '@/lib/notifications/repo';
import type { PendingUser, ScanPendingResult } from './scanPending';
import { ESCALATION_THRESHOLDS } from './scanPending';

// ========== 型定義 ==========

/**
 * リマインド処理結果
 */
export interface ReminderResult {
  userNotificationsCreated: number;
  managerDigestsCreated: number;
  escalationsCreated: number;
  skippedDuplicates: number;
  errors: string[];
}

// ========== 定数 ==========

const DEFAULT_TENANT_ID = 'tenant_001';

/**
 * 今日の日付（YYYY-MM-DD）
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// ========== 本人通知 ==========

/**
 * 本人向けリマインド通知を作成
 *
 * fingerprint: onboarding:remind:{userId}:{YYYY-MM-DD}
 * → 1日1回のみ
 */
export function createUserReminders(
  pendingUsers: PendingUser[]
): { created: number; skipped: number; errors: string[] } {
  const today = getToday();
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const user of pendingUsers) {
    try {
      const fingerprint = `onboarding:remind:${user.userId}:${today}`;

      // 未署名文書のタイトルを取得
      const pendingTitles = user.onboarding.requiredItems
        .filter((i) => i.status === 'pending')
        .map((i) => i.title)
        .slice(0, 3); // 最大3件表示

      const titleList = pendingTitles.join('、');
      const moreCount = user.pendingCount - pendingTitles.length;
      const titleSuffix = moreCount > 0 ? ` 他${moreCount}件` : '';

      const result = notificationRepo.create({
        tenantId: DEFAULT_TENANT_ID,
        userId: user.userId,
        type: 'system',
        severity: user.escalationLevel === 'critical' ? 'critical' :
                  user.escalationLevel === 'warning' ? 'warning' : 'info',
        title: '必須書類の署名が未完了です',
        message: `${titleList}${titleSuffix}の署名を完了してください。業務画面へのアクセスには署名完了が必要です。`,
        url: '/onboarding/contracts',
        fingerprint,
      });

      if (result.isNew) {
        created++;
      } else {
        skipped++;
      }
    } catch (error) {
      errors.push(`User ${user.userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { created, skipped, errors };
}

// ========== Manager/Admin ダイジェスト ==========

/**
 * Manager向けダイジェスト通知を作成
 *
 * fingerprint: onboarding:manager_digest:{YYYY-MM-DD}
 * → 1日1回、全managerに送信
 */
export function createManagerDigest(
  scanResult: ScanPendingResult,
  managerUserIds: string[]
): { created: number; skipped: number; errors: string[] } {
  const today = getToday();
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (scanResult.totalPendingCount === 0) {
    return { created: 0, skipped: 0, errors: [] };
  }

  // 統計メッセージを作成
  let message = `オンボーディング未完了者が${scanResult.totalPendingCount}名います。`;
  if (scanResult.criticalCount > 0) {
    message += ` うち${scanResult.criticalCount}名は${ESCALATION_THRESHOLDS.critical}日以上未完了です。`;
  } else if (scanResult.warningCount > 0) {
    message += ` うち${scanResult.warningCount}名は${ESCALATION_THRESHOLDS.warning}日以上未完了です。`;
  }

  for (const managerId of managerUserIds) {
    try {
      const fingerprint = `onboarding:manager_digest:${managerId}:${today}`;

      const result = notificationRepo.create({
        tenantId: DEFAULT_TENANT_ID,
        userId: managerId,
        type: 'system',
        severity: scanResult.criticalCount > 0 ? 'critical' :
                  scanResult.warningCount > 0 ? 'warning' : 'info',
        title: 'オンボーディング未完了者レポート',
        message,
        url: '/admin/onboarding',
        fingerprint,
      });

      if (result.isNew) {
        created++;
      } else {
        skipped++;
      }
    } catch (error) {
      errors.push(`Manager ${managerId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { created, skipped, errors };
}

// ========== Escalation 通知 ==========

/**
 * Escalation 通知を作成（warning/critical）
 *
 * fingerprint: onboarding:escalate:{userId}:{YYYY-MM-DD}
 * → 1日1回、該当ユーザーの上長/adminに送信
 */
export function createEscalationNotifications(
  pendingUsers: PendingUser[],
  adminUserIds: string[]
): { created: number; skipped: number; errors: string[] } {
  const today = getToday();
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  // warning/critical のユーザーのみ
  const escalatedUsers = pendingUsers.filter(
    (u) => u.escalationLevel === 'warning' || u.escalationLevel === 'critical'
  );

  if (escalatedUsers.length === 0) {
    return { created: 0, skipped: 0, errors: [] };
  }

  // critical ユーザーがいる場合は admin にも通知
  const criticalUsers = escalatedUsers.filter((u) => u.escalationLevel === 'critical');

  for (const adminId of adminUserIds) {
    if (criticalUsers.length === 0) continue;

    try {
      const fingerprint = `onboarding:escalate:admin:${adminId}:${today}`;

      const userList = criticalUsers
        .slice(0, 5)
        .map((u) => u.userId)
        .join(', ');
      const moreCount = criticalUsers.length - 5;
      const userSuffix = moreCount > 0 ? ` 他${moreCount}名` : '';

      const result = notificationRepo.create({
        tenantId: DEFAULT_TENANT_ID,
        userId: adminId,
        type: 'system',
        severity: 'critical',
        title: 'オンボーディング長期未完了アラート',
        message: `${criticalUsers.length}名が${ESCALATION_THRESHOLDS.critical}日以上オンボーディング未完了です: ${userList}${userSuffix}`,
        url: '/admin/onboarding',
        fingerprint,
      });

      if (result.isNew) {
        created++;
      } else {
        skipped++;
      }
    } catch (error) {
      errors.push(`Admin escalation ${adminId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { created, skipped, errors };
}

// ========== メイン処理 ==========

/**
 * リマインド処理を実行
 */
export function executeReminders(
  scanResult: ScanPendingResult,
  managerUserIds: string[],
  adminUserIds: string[]
): ReminderResult {
  const errors: string[] = [];

  // 1. 本人通知
  const userResult = createUserReminders(scanResult.pendingUsers);
  errors.push(...userResult.errors);

  // 2. Manager ダイジェスト
  const managerResult = createManagerDigest(scanResult, managerUserIds);
  errors.push(...managerResult.errors);

  // 3. Escalation
  const escalationResult = createEscalationNotifications(
    scanResult.pendingUsers,
    adminUserIds
  );
  errors.push(...escalationResult.errors);

  return {
    userNotificationsCreated: userResult.created,
    managerDigestsCreated: managerResult.created,
    escalationsCreated: escalationResult.created,
    skippedDuplicates: userResult.skipped + managerResult.skipped + escalationResult.skipped,
    errors,
  };
}
