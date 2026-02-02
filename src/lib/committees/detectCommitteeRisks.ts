/**
 * 委員会リスク検知
 *
 * 開催漏れ・期限超過アクションを検知してアラートを作成
 */

import {
  scanCommitteeCadenceRisk,
  scanOverdueActionItems,
} from './repo';
import { createAlert } from '@/lib/alerts/repo';
import type { CreateAlertRequest } from '@/lib/alerts/types';

/**
 * リスクの閾値
 */
const CADENCE_CRITICAL_THRESHOLD = 3; // 開催漏れ3件以上でcritical
const ACTION_CRITICAL_THRESHOLD = 5; // 期限超過アクション5件以上でcritical

/**
 * 委員会リスクを検知してアラートを生成
 */
export function detectCommitteeRisks(): {
  cadenceRiskCount: number;
  overdueActionCount: number;
  alertCreated: boolean;
  severity: 'warning' | 'critical' | null;
} {
  const cadenceRisks = scanCommitteeCadenceRisk();
  const overdueActions = scanOverdueActionItems();

  const cadenceRiskCount = cadenceRisks.length;
  const overdueActionCount = overdueActions.length;

  // リスクがなければ終了
  if (cadenceRiskCount === 0 && overdueActionCount === 0) {
    return {
      cadenceRiskCount: 0,
      overdueActionCount: 0,
      alertCreated: false,
      severity: null,
    };
  }

  // 日付ベースのfingerprint（1日1回のアラート）
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // severity判定
  const isCritical =
    cadenceRiskCount >= CADENCE_CRITICAL_THRESHOLD ||
    overdueActionCount >= ACTION_CRITICAL_THRESHOLD ||
    cadenceRisks.some((r) => r.required && r.daysOverdue > 0);

  const severity = isCritical ? 'critical' : 'warning';

  // メッセージ生成
  const messageParts: string[] = [];
  if (cadenceRiskCount > 0) {
    const requiredCount = cadenceRisks.filter((r) => r.required).length;
    messageParts.push(
      `開催漏れ: ${cadenceRiskCount}件${requiredCount > 0 ? `（うち法定${requiredCount}件）` : ''}`
    );
  }
  if (overdueActionCount > 0) {
    messageParts.push(`期限超過アクション: ${overdueActionCount}件`);
  }
  messageParts.push('committees画面で確認してください。');

  // 開催漏れアラート
  if (cadenceRiskCount > 0) {
    const fingerprint = `committee:cadence:${today}`;
    const alertRequest: CreateAlertRequest = {
      type: 'committee_risk',
      sourceId: null,
      title: '委員会リスク：開催漏れが発生',
      message: messageParts.join(' '),
      severity,
      fingerprint,
      assignedRole: 'manager',
      meta: {
        cadenceRiskCount,
        overdueActionCount,
        requiredCadenceRisks: cadenceRisks
          .filter((r) => r.required)
          .map((r) => ({
            committeeId: r.committeeId,
            committeeName: r.committeeName,
            daysOverdue: r.daysOverdue,
          })),
        scannedAt: new Date().toISOString(),
      },
    };

    const result = createAlert(alertRequest);
    if (result.isNew) {
      // 期限超過アクションがあれば別アラートも作成
      if (overdueActionCount > 0) {
        createOverdueActionsAlert(overdueActionCount, overdueActions, severity, today);
      }

      return {
        cadenceRiskCount,
        overdueActionCount,
        alertCreated: true,
        severity,
      };
    }
  }

  // 期限超過アクションのみの場合
  if (overdueActionCount > 0 && cadenceRiskCount === 0) {
    const created = createOverdueActionsAlert(
      overdueActionCount,
      overdueActions,
      severity,
      today
    );

    return {
      cadenceRiskCount: 0,
      overdueActionCount,
      alertCreated: created,
      severity,
    };
  }

  return {
    cadenceRiskCount,
    overdueActionCount,
    alertCreated: false,
    severity,
  };
}

/**
 * 期限超過アクションアラートを作成
 */
function createOverdueActionsAlert(
  count: number,
  overdueActions: { id: string; title: string; committeeName: string; daysOverdue: number }[],
  severity: 'warning' | 'critical',
  today: string
): boolean {
  const fingerprint = `committee:actions:overdue:${today}`;

  const topActions = overdueActions.slice(0, 5).map((a) => ({
    id: a.id,
    title: a.title,
    committeeName: a.committeeName,
    daysOverdue: a.daysOverdue,
  }));

  const alertRequest: CreateAlertRequest = {
    type: 'committee_risk',
    sourceId: null,
    title: '委員会リスク：是正未完了が発生',
    message: `期限超過アクションが${count}件あります。早急な対応が必要です。`,
    severity,
    fingerprint,
    assignedRole: 'manager',
    meta: {
      overdueActionCount: count,
      topActions,
      scannedAt: new Date().toISOString(),
    },
  };

  const result = createAlert(alertRequest);
  return result.isNew;
}

/**
 * 委員会リスクレポートを生成
 */
export function getCommitteeRiskReport(): {
  cadenceRisks: {
    committeeId: string;
    committeeName: string;
    cadence: string;
    required: boolean;
    lastHeldAt: string | null;
    expectedNextBy: string;
    daysOverdue: number;
  }[];
  overdueActions: {
    id: string;
    title: string;
    committeeName: string;
    meetingTitle: string;
    dueAt: string;
    daysOverdue: number;
  }[];
  summary: {
    totalCadenceRisks: number;
    requiredCadenceRisks: number;
    totalOverdueActions: number;
    criticalLevel: boolean;
  };
} {
  const cadenceRisks = scanCommitteeCadenceRisk();
  const overdueActions = scanOverdueActionItems();

  const requiredCadenceRisks = cadenceRisks.filter((r) => r.required).length;
  const criticalLevel =
    cadenceRisks.length >= CADENCE_CRITICAL_THRESHOLD ||
    overdueActions.length >= ACTION_CRITICAL_THRESHOLD ||
    requiredCadenceRisks > 0;

  return {
    cadenceRisks: cadenceRisks.map((r) => ({
      committeeId: r.committeeId,
      committeeName: r.committeeName,
      cadence: r.cadence,
      required: r.required,
      lastHeldAt: r.lastHeldAt,
      expectedNextBy: r.expectedNextBy,
      daysOverdue: r.daysOverdue,
    })),
    overdueActions: overdueActions.map((a) => ({
      id: a.id,
      title: a.title,
      committeeName: a.committeeName,
      meetingTitle: a.meetingTitle,
      dueAt: a.dueAt!,
      daysOverdue: a.daysOverdue,
    })),
    summary: {
      totalCadenceRisks: cadenceRisks.length,
      requiredCadenceRisks,
      totalOverdueActions: overdueActions.length,
      criticalLevel,
    },
  };
}
