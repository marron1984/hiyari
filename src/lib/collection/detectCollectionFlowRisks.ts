/**
 * 回収フローリスク検出
 *
 * ステップ期限超過を検出してアラートを生成
 */

import type { CreateAlertRequest } from '@/lib/alerts/types';
import { generateFingerprint } from '@/lib/alerts/types';
import { scanOverdueSteps, getStats } from './repo';
import { COLLECTION_ACTION_TYPE_LABELS } from './types';

// デモビューア
const DEMO_VIEWER = {
  userId: 'system',
  role: 'admin' as const,
};

/**
 * 回収フローリスクをスキャンしてアラートリクエストを生成
 */
export function detectCollectionFlowRisks(): CreateAlertRequest[] {
  const alerts: CreateAlertRequest[] = [];
  const today = new Date().toISOString().split('T')[0];

  const overdueSteps = scanOverdueSteps();

  if (overdueSteps.length === 0) {
    return alerts;
  }

  // 1) 個別の期限超過（severity=critical のみ）
  const criticalOverdue = overdueSteps.filter(
    (info) => info.step?.severity === 'critical'
  );

  for (const info of criticalOverdue.slice(0, 3)) {
    const { stepLog, template, step, overdueDays } = info;
    const actionLabel = step
      ? COLLECTION_ACTION_TYPE_LABELS[step.actionType]
      : '不明';

    alerts.push({
      type: 'collection_flow_risk',
      sourceId: stepLog.receivableId,
      title: `回収ステップ期限超過（緊急）: ${actionLabel}`,
      message: `ステップ${stepLog.stepOrder}（${actionLabel}）が${overdueDays}日超過しています。至急対応してください。`,
      severity: 'critical',
      fingerprint: generateFingerprint(
        'collection_flow_risk',
        stepLog.receivableId,
        `step:${stepLog.stepOrder}:overdue:${today}`
      ),
      assignedRole: 'manager',
      assignedUserId: null,
      meta: {
        receivableId: stepLog.receivableId,
        templateId: template?.id,
        templateName: template?.name,
        stepOrder: stepLog.stepOrder,
        actionType: step?.actionType,
        overdueDays,
        plannedDueAt: stepLog.plannedDueAt,
      },
    });
  }

  // 2) サマリーアラート（期限超過が複数ある場合）
  if (overdueSteps.length > 0) {
    const criticalCount = criticalOverdue.length;
    const warningCount = overdueSteps.filter(
      (info) => info.step?.severity === 'warning'
    ).length;

    const severity = criticalCount > 0 ? 'critical' : 'warning';

    alerts.push({
      type: 'collection_flow_risk',
      sourceId: 'summary',
      title: '回収フローリスク：ステップ期限超過',
      message: `期限超過ステップ: ${overdueSteps.length}件（緊急: ${criticalCount}件, 注意: ${warningCount}件）。回収フロー画面で確認してください。`,
      severity,
      fingerprint: generateFingerprint(
        'collection_flow_risk',
        'summary',
        `overdue:${today}`
      ),
      assignedRole: 'manager',
      assignedUserId: null,
      meta: {
        totalOverdue: overdueSteps.length,
        criticalCount,
        warningCount,
      },
    });
  }

  return alerts;
}

/**
 * 回収フローリスクサマリーを取得
 */
export function getCollectionFlowRiskSummary(): {
  overdueStepCount: number;
  criticalOverdueCount: number;
  warningOverdueCount: number;
  activeAssignments: number;
} {
  const overdueSteps = scanOverdueSteps();
  const stats = getStats(DEMO_VIEWER);

  const criticalCount = overdueSteps.filter(
    (info) => info.step?.severity === 'critical'
  ).length;

  const warningCount = overdueSteps.filter(
    (info) => info.step?.severity === 'warning'
  ).length;

  return {
    overdueStepCount: overdueSteps.length,
    criticalOverdueCount: criticalCount,
    warningOverdueCount: warningCount,
    activeAssignments: stats?.activeAssignments ?? 0,
  };
}
