/**
 * 朝イチダイジェスト通知送信
 *
 * Implementation Ticket 060: 朝イチダイジェスト通知（055）と Role Home（059）を連動
 *
 * 毎朝（例：9:00）に「今日のTop3」と主要リスクのダイジェスト通知を送る
 * - fingerprint による冪等性（同日二重送信しない）
 * - role で送信対象を制御
 * - 055のNOTIFY_POLICIES（digest）と整合
 */

import type { AppRole } from '@/config/appRoles';
import type { NotificationType } from '@/types/notification';
import {
  buildDailyDigest,
  buildDailyDigestForRoles,
  formatDigestAsMessage,
  formatDigestAsShortMessage,
  isDigestEmpty,
  type DailyDigest,
} from './buildDailyDigest';
import {
  create as createNotification,
  getByFingerprint,
} from '@/lib/notifications/repo';

// ========== 型定義 ==========

export interface SendDigestOptions {
  /** 送信対象ロール */
  targetRoles?: AppRole[];
  /** 空ダイジェストも送信するか（デフォルト: false） */
  sendEmpty?: boolean;
  /** テナントID（デフォルト: 'default'） */
  tenantId?: string;
  /** 対象日（デフォルト: 今日） */
  date?: Date;
}

export interface SendDigestResult {
  date: string;
  sentCount: number;
  skippedCount: number;
  emptyCount: number;
  alreadySentCount: number;
  byRole: Record<string, {
    sent: boolean;
    reason: 'sent' | 'already_sent' | 'empty' | 'error';
    notificationId?: string;
  }>;
}

// ========== 定数 ==========

/** ダイジェスト通知のタイプ */
const DIGEST_NOTIFICATION_TYPE: NotificationType = 'system';

/** デフォルトの送信対象ロール */
const DEFAULT_TARGET_ROLES: AppRole[] = ['staff', 'leader', 'manager', 'executive', 'admin'];

/** ロール別のデフォルトユーザーID（実運用ではユーザーマスタから取得） */
const DEFAULT_USER_IDS: Record<AppRole, string> = {
  staff: 'user_staff',
  leader: 'user_leader',
  manager: 'user_manager',
  executive: 'user_executive',
  admin: 'admin',
  auditor: 'user_auditor',
};

// ========== メイン関数 ==========

/**
 * 朝イチダイジェスト通知を送信
 *
 * 冪等性:
 * - fingerprint = `digest:{role}:{YYYY-MM-DD}` で同日の重複送信を防止
 * - 既に送信済みの場合はスキップ
 *
 * @param options 送信オプション
 * @returns 送信結果
 */
export function sendMorningDigest(
  options: SendDigestOptions = {}
): SendDigestResult {
  const {
    targetRoles = DEFAULT_TARGET_ROLES,
    sendEmpty = false,
    tenantId = 'default',
    date = new Date(),
  } = options;

  const dateStr = date.toISOString().slice(0, 10);

  const result: SendDigestResult = {
    date: dateStr,
    sentCount: 0,
    skippedCount: 0,
    emptyCount: 0,
    alreadySentCount: 0,
    byRole: {},
  };

  // ロール別ユーザーIDマップを作成
  const userIdsByRole = new Map<AppRole, string>();
  for (const role of targetRoles) {
    userIdsByRole.set(role, DEFAULT_USER_IDS[role] || 'system');
  }

  // 各ロール向けにダイジェストを生成・送信
  const digests = buildDailyDigestForRoles(targetRoles, userIdsByRole, date);

  for (const [role, digest] of digests) {
    const userId = userIdsByRole.get(role) || 'system';

    // 空チェック
    if (isDigestEmpty(digest) && !sendEmpty) {
      result.emptyCount++;
      result.byRole[role] = { sent: false, reason: 'empty' };
      continue;
    }

    // 既存チェック（冪等性）
    const existing = getByFingerprint(userId, digest.fingerprint);
    if (existing) {
      result.alreadySentCount++;
      result.byRole[role] = {
        sent: false,
        reason: 'already_sent',
        notificationId: existing.id,
      };
      continue;
    }

    // 通知作成
    try {
      const { notification, isNew } = createNotification({
        tenantId,
        userId,
        type: DIGEST_NOTIFICATION_TYPE,
        severity: determineSeverity(digest),
        title: digest.title,
        message: formatDigestAsShortMessage(digest),
        url: digest.url,
        fingerprint: digest.fingerprint,
        metadata: {
          targetRole: role,
        },
      });

      if (isNew) {
        result.sentCount++;
        result.byRole[role] = {
          sent: true,
          reason: 'sent',
          notificationId: notification.id,
        };
      } else {
        result.alreadySentCount++;
        result.byRole[role] = {
          sent: false,
          reason: 'already_sent',
          notificationId: notification.id,
        };
      }
    } catch (error) {
      console.error(`[MorningDigest] Failed to send for role ${role}:`, error);
      result.skippedCount++;
      result.byRole[role] = { sent: false, reason: 'error' };
    }
  }

  console.log(
    `[MorningDigest] Sent ${result.sentCount} digests for ${dateStr}` +
    ` (skipped: ${result.skippedCount}, empty: ${result.emptyCount}, already: ${result.alreadySentCount})`
  );

  return result;
}

/**
 * 特定ロール向けにダイジェスト通知を送信
 */
export function sendMorningDigestForRole(
  role: AppRole,
  userId: string,
  options: Omit<SendDigestOptions, 'targetRoles'> = {}
): {
  sent: boolean;
  reason: 'sent' | 'already_sent' | 'empty' | 'error';
  digest: DailyDigest;
  notificationId?: string;
} {
  const {
    sendEmpty = false,
    tenantId = 'default',
    date = new Date(),
  } = options;

  const digest = buildDailyDigest(role, userId, date);

  // 空チェック
  if (isDigestEmpty(digest) && !sendEmpty) {
    return { sent: false, reason: 'empty', digest };
  }

  // 既存チェック（冪等性）
  const existing = getByFingerprint(userId, digest.fingerprint);
  if (existing) {
    return {
      sent: false,
      reason: 'already_sent',
      digest,
      notificationId: existing.id,
    };
  }

  // 通知作成
  try {
    const { notification, isNew } = createNotification({
      tenantId,
      userId,
      type: DIGEST_NOTIFICATION_TYPE,
      severity: determineSeverity(digest),
      title: digest.title,
      message: formatDigestAsShortMessage(digest),
      url: digest.url,
      fingerprint: digest.fingerprint,
      metadata: {
        targetRole: role,
      },
    });

    return {
      sent: isNew,
      reason: isNew ? 'sent' : 'already_sent',
      digest,
      notificationId: notification.id,
    };
  } catch (error) {
    console.error(`[MorningDigest] Failed to send for role ${role}:`, error);
    return { sent: false, reason: 'error', digest };
  }
}

// ========== ヘルパー ==========

/**
 * ダイジェストの重要度を判定
 */
function determineSeverity(digest: DailyDigest): 'info' | 'warning' | 'critical' {
  if (digest.risks.criticalCount > 0) return 'critical';
  if (digest.risks.warningCount > 0 || digest.top3.items.some(i => i.severity === 'warning')) {
    return 'warning';
  }
  return 'info';
}

/**
 * ダイジェスト送信のプレビューを生成（実際には送信しない）
 */
export function previewMorningDigest(
  options: SendDigestOptions = {}
): Map<AppRole, { digest: DailyDigest; message: string; wouldSend: boolean }> {
  const {
    targetRoles = DEFAULT_TARGET_ROLES,
    sendEmpty = false,
    date = new Date(),
  } = options;

  const userIdsByRole = new Map<AppRole, string>();
  for (const role of targetRoles) {
    userIdsByRole.set(role, DEFAULT_USER_IDS[role] || 'system');
  }

  const digests = buildDailyDigestForRoles(targetRoles, userIdsByRole, date);
  const result = new Map<AppRole, { digest: DailyDigest; message: string; wouldSend: boolean }>();

  for (const [role, digest] of digests) {
    const userId = userIdsByRole.get(role) || 'system';
    const existing = getByFingerprint(userId, digest.fingerprint);
    const isEmpty = isDigestEmpty(digest);

    const wouldSend = !existing && (!isEmpty || sendEmpty);

    result.set(role, {
      digest,
      message: formatDigestAsMessage(digest),
      wouldSend,
    });
  }

  return result;
}

// ========== API用エクスポート ==========

export {
  buildDailyDigest,
  buildDailyDigestForRoles,
  formatDigestAsMessage,
  formatDigestAsShortMessage,
  isDigestEmpty,
  type DailyDigest,
} from './buildDailyDigest';

export {
  buildTodayTop3,
  formatTop3AsText,
  type TodayTop3Result,
  type TodayTop3Item,
} from './buildTodayTop3';
