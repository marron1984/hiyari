/**
 * 研修期限超過検知
 *
 * 期限を過ぎた研修割り当てを検知してアラートを作成
 */

import { overdueAssignmentsScan } from './repo';
import { createAlert } from '@/lib/alerts/repo';
import type { CreateAlertRequest } from '@/lib/alerts/types';

/**
 * 期限超過の閾値
 */
const CRITICAL_THRESHOLD = 10; // この数以上でcritical

/**
 * 研修期限超過を検知してアラートを生成
 */
export function detectOverdueTraining(): {
  detected: number;
  alertCreated: boolean;
  severity: 'warning' | 'critical' | null;
} {
  const overdueList = overdueAssignmentsScan();
  const overdueCount = overdueList.length;

  if (overdueCount === 0) {
    return {
      detected: 0,
      alertCreated: false,
      severity: null,
    };
  }

  // 日付ベースのfingerprint（1日1回のアラート）
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const fingerprint = `training:overdue:${today}`;

  // severity判定
  const severity = overdueCount >= CRITICAL_THRESHOLD ? 'critical' : 'warning';

  // メッセージ生成
  const userIds = [...new Set(overdueList.map((a) => a.userId))];
  const sessionIds = [...new Set(overdueList.map((a) => a.sessionId))];

  const message =
    severity === 'critical'
      ? `${overdueCount}件の研修が期限超過しています（${userIds.length}名、${sessionIds.length}セッション）。早急な対応が必要です。`
      : `${overdueCount}件の研修が期限超過しています。対象者への督促をお願いします。`;

  const alertRequest: CreateAlertRequest = {
    type: 'training_overdue',
    sourceId: null,
    title: '研修未受講アラート：期限超過が発生',
    message,
    severity,
    fingerprint,
    assignedRole: 'manager',
    meta: {
      overdueCount,
      affectedUsers: userIds.length,
      affectedSessions: sessionIds.length,
      scannedAt: new Date().toISOString(),
    },
  };

  const result = createAlert(alertRequest);

  return {
    detected: overdueCount,
    alertCreated: result.isNew,
    severity,
  };
}

/**
 * スキャン結果の詳細レポートを生成
 */
export function getOverdueReport(): {
  totalOverdue: number;
  byUser: { userId: string; count: number }[];
  bySession: { sessionId: string; count: number }[];
  details: {
    userId: string;
    sessionId: string;
    dueAt: string;
    daysOverdue: number;
  }[];
} {
  const overdueList = overdueAssignmentsScan();
  const now = new Date();

  // ユーザー別集計
  const userCounts = new Map<string, number>();
  for (const a of overdueList) {
    userCounts.set(a.userId, (userCounts.get(a.userId) ?? 0) + 1);
  }
  const byUser = Array.from(userCounts.entries())
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count);

  // セッション別集計
  const sessionCounts = new Map<string, number>();
  for (const a of overdueList) {
    sessionCounts.set(a.sessionId, (sessionCounts.get(a.sessionId) ?? 0) + 1);
  }
  const bySession = Array.from(sessionCounts.entries())
    .map(([sessionId, count]) => ({ sessionId, count }))
    .sort((a, b) => b.count - a.count);

  // 詳細リスト
  const details = overdueList.map((a) => {
    const dueDate = new Date(a.dueAt!);
    const daysOverdue = Math.floor(
      (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      userId: a.userId,
      sessionId: a.sessionId,
      dueAt: a.dueAt!,
      daysOverdue,
    };
  });

  return {
    totalOverdue: overdueList.length,
    byUser,
    bySession,
    details,
  };
}
