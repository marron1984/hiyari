/**
 * オンボーディング未完了エスカレーション（チケット自動生成）
 *
 * Ticket 099: 未署名者への強制連絡オペ
 *
 * - escalationLevel >= 2 (warning以上) でチケットを生成
 * - relatedId で冪等性を保証
 * - autoAssign で担当者を自動割当
 * - 通知を作成
 */

import type { PendingUser } from './scanPending';
import { createTicket, listTickets } from '@/lib/tickets/repo';
import type { TicketPriority, Ticket } from '@/lib/tickets/types';
import { create as createNotification } from '@/lib/notifications/repo';
import { getUserById } from '@/lib/roles/user-store';
import { getUserOrgContext } from '@/lib/org/repo';
import { listBusinessUnits } from '@/lib/business/repo';
import { getCurrentRequirementsVersion } from './repo';

// ========== ユーティリティ ==========

/**
 * orgUnitId から businessUnitId を解決
 */
function findBusinessUnitIdByOrgUnitId(orgUnitId: string | null): string | null {
  if (!orgUnitId) return null;

  const businessUnits = listBusinessUnits(true);
  const found = businessUnits.find((bu) => bu.orgUnitId === orgUnitId);
  return found?.id ?? null;
}

// ========== 型定義 ==========

export interface EscalationTicketResult {
  ticketsCreated: number;
  ticketsSkipped: number;
  notificationsCreated: number;
  errors: string[];
  createdTickets: Array<{
    ticketId: string;
    userId: string;
    escalationLevel: 'warning' | 'critical';
  }>;
}

export interface OnboardingFollowupMeta {
  pipeline: 'onboarding_followup';
  userId: string;
  userName: string | null;
  escalationLevel: 'warning' | 'critical';
  requirementsVersion: number;
  pendingCount: number;
  oldestPendingDays: number;
  dueAt: string | null;
  [key: string]: unknown; // Index signature for Record<string, unknown> compatibility
}

// ========== 設定 ==========

/**
 * エスカレーション対象の閾値
 * escalationLevel >= 2 または oldestPendingDays >= 3
 */
export const ESCALATION_TICKET_THRESHOLD = {
  minEscalationLevel: 2,  // warning = 2, critical = 3
  minOverdueDays: 3,
} as const;

/**
 * escalationLevel を数値に変換
 */
function escalationLevelToNumber(level: 'normal' | 'warning' | 'critical'): number {
  switch (level) {
    case 'critical': return 3;
    case 'warning': return 2;
    default: return 1;
  }
}

/**
 * escalationLevel から優先度を決定
 */
function getPriorityFromEscalation(level: 'normal' | 'warning' | 'critical'): TicketPriority {
  switch (level) {
    case 'critical': return 'urgent';
    case 'warning': return 'high';
    default: return 'normal';
  }
}

// ========== チケット生成 ==========

/**
 * relatedId を生成（冪等性用）
 */
export function generateFollowupRelatedId(userId: string, requirementsVersion: number): string {
  return `onboarding_followup:${userId}:${requirementsVersion}`;
}

/**
 * 既存のフォローアップチケットを検索
 */
export function findExistingFollowupTicket(
  userId: string,
  requirementsVersion: number
): Ticket | null {
  const relatedId = generateFollowupRelatedId(userId, requirementsVersion);

  // open/in_progress/waiting ステータスのチケットを検索
  const { items } = listTickets(
    { status: 'open', limit: 100 },
    { userId: 'system', role: 'admin' }
  );

  let found = items.find(t =>
    t.relatedType === 'onboarding_followup' &&
    t.relatedId === relatedId
  );

  if (found) return found;

  // in_progress も検索
  const { items: inProgress } = listTickets(
    { status: 'in_progress', limit: 100 },
    { userId: 'system', role: 'admin' }
  );

  found = inProgress.find(t =>
    t.relatedType === 'onboarding_followup' &&
    t.relatedId === relatedId
  );

  if (found) return found;

  // waiting も検索
  const { items: waiting } = listTickets(
    { status: 'waiting', limit: 100 },
    { userId: 'system', role: 'admin' }
  );

  return waiting.find(t =>
    t.relatedType === 'onboarding_followup' &&
    t.relatedId === relatedId
  ) ?? null;
}

/**
 * フォローアップチケットを作成
 */
function createFollowupTicket(
  pendingUser: PendingUser,
  requirementsVersion: number
): Ticket {
  const user = getUserById(pendingUser.userId);
  const userName = user?.name ?? pendingUser.userId;

  // 組織情報を取得
  const orgContext = getUserOrgContext(pendingUser.userId);
  const businessUnitId = findBusinessUnitIdByOrgUnitId(orgContext.primaryOrgUnitId);

  const relatedId = generateFollowupRelatedId(pendingUser.userId, requirementsVersion);

  const meta: OnboardingFollowupMeta = {
    pipeline: 'onboarding_followup',
    userId: pendingUser.userId,
    userName,
    escalationLevel: pendingUser.escalationLevel as 'warning' | 'critical',
    requirementsVersion,
    pendingCount: pendingUser.pendingCount,
    oldestPendingDays: pendingUser.oldestPendingDays,
    dueAt: null,
  };

  const priority = getPriorityFromEscalation(pendingUser.escalationLevel);

  const ticket = createTicket(
    {
      title: `[オンボーディング未完了] 必須署名フォロー: ${userName}`,
      description: generateTicketDescription(pendingUser, userName),
      category: 'hr',
      priority,
      businessUnitId,
      relatedType: 'onboarding_followup',
      relatedId,
      meta: meta as Record<string, unknown>,
      tags: ['オンボーディング', '未署名フォロー'],
    },
    'system' // システムによる自動作成
  );

  return ticket;
}

/**
 * チケット説明文を生成
 */
function generateTicketDescription(pendingUser: PendingUser, userName: string): string {
  const lines = [
    `## 未署名フォローアップ`,
    '',
    `**対象者**: ${userName} (${pendingUser.userId})`,
    `**ロール**: ${pendingUser.role}`,
    `**未署名文書数**: ${pendingUser.pendingCount}件`,
    `**経過日数**: ${pendingUser.oldestPendingDays}日`,
    `**エスカレーションレベル**: ${pendingUser.escalationLevel === 'critical' ? '🔴 重大' : '🟠 警告'}`,
    '',
    '### 未署名文書',
  ];

  for (const item of pendingUser.onboarding.requiredItems) {
    if (item.status === 'pending') {
      lines.push(`- ${item.title}`);
    }
  }

  lines.push('');
  lines.push('### 対応内容');
  lines.push('1. 本人に連絡し、署名を促してください');
  lines.push('2. 対応結果をコメントに記録してください');
  lines.push('3. 署名が完了したらこのチケットを解決済みにしてください');

  return lines.join('\n');
}

/**
 * 担当者に通知を作成
 */
function createAssigneeNotification(
  ticket: Ticket,
  pendingUser: PendingUser,
  userName: string
): boolean {
  if (!ticket.assigneeUserId) {
    return false;
  }

  try {
    const levelEmoji = pendingUser.escalationLevel === 'critical' ? '🔴' : '🟠';
    const severity = pendingUser.escalationLevel === 'critical' ? 'critical' : 'warning';

    createNotification({
      tenantId: 'default',
      userId: ticket.assigneeUserId,
      type: 'system',
      severity,
      title: `${levelEmoji} 未署名フォローアップ: ${userName}`,
      message: `${userName}さんのオンボーディング署名が${pendingUser.oldestPendingDays}日間未完了です。フォローアップをお願いします。`,
      url: `/dashboard/tickets/${ticket.id}`,
      fingerprint: `onboarding_followup:${ticket.id}`,
    });

    return true;
  } catch {
    return false;
  }
}

// ========== メイン関数 ==========

/**
 * エスカレーション対象のユーザーにチケットを生成
 */
export function createEscalationTickets(
  pendingUsers: PendingUser[]
): EscalationTicketResult {
  const result: EscalationTicketResult = {
    ticketsCreated: 0,
    ticketsSkipped: 0,
    notificationsCreated: 0,
    errors: [],
    createdTickets: [],
  };

  const requirementsVersion = getCurrentRequirementsVersion();

  for (const pendingUser of pendingUsers) {
    try {
      // エスカレーション対象かチェック
      const levelNum = escalationLevelToNumber(pendingUser.escalationLevel);
      const isTarget =
        levelNum >= ESCALATION_TICKET_THRESHOLD.minEscalationLevel ||
        pendingUser.oldestPendingDays >= ESCALATION_TICKET_THRESHOLD.minOverdueDays;

      if (!isTarget) {
        continue;
      }

      // 既存チケットをチェック（冪等性）
      const existingTicket = findExistingFollowupTicket(
        pendingUser.userId,
        requirementsVersion
      );

      if (existingTicket) {
        result.ticketsSkipped++;
        continue;
      }

      // チケット作成
      const user = getUserById(pendingUser.userId);
      const userName = user?.name ?? pendingUser.userId;

      const ticket = createFollowupTicket(pendingUser, requirementsVersion);
      result.ticketsCreated++;
      result.createdTickets.push({
        ticketId: ticket.id,
        userId: pendingUser.userId,
        escalationLevel: pendingUser.escalationLevel as 'warning' | 'critical',
      });

      // 担当者通知
      if (createAssigneeNotification(ticket, pendingUser, userName)) {
        result.notificationsCreated++;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`userId=${pendingUser.userId}: ${errorMessage}`);
    }
  }

  return result;
}

/**
 * ユーザーのフォローアップチケットを取得
 */
export function getUserFollowupTicket(userId: string): Ticket | null {
  const requirementsVersion = getCurrentRequirementsVersion();
  return findExistingFollowupTicket(userId, requirementsVersion);
}
