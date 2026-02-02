/**
 * 未収リスク検出
 *
 * 期限超過・高額・長期滞留の未収を検出してアラートを生成
 */

import type { CreateAlertRequest } from '@/lib/alerts/types';
import { generateFingerprint } from '@/lib/alerts/types';
import { scanReceivableRisks, getStats } from './repo';
import { formatAmount, maskSubjectName } from './types';

// デモビューア
const DEMO_VIEWER = {
  userId: 'system',
  role: 'admin' as const,
};

/**
 * 未収リスクをスキャンしてアラートリクエストを生成
 */
export function detectReceivableRisks(): CreateAlertRequest[] {
  const alerts: CreateAlertRequest[] = [];
  const today = new Date().toISOString().split('T')[0];

  // 1) 個別リスク（高額期限超過、長期滞留）
  const risks = scanReceivableRisks();

  // 高額（10万以上）で期限超過
  const highAmountOverdue = risks.filter(
    (r) => r.riskType === 'high_amount' && r.receivable.amount >= 100000
  );

  for (const risk of highAmountOverdue.slice(0, 5)) {
    // 上位5件までアラート
    const { receivable, agingDays } = risk;
    alerts.push({
      type: 'receivable_risk',
      sourceId: receivable.id,
      title: `高額未収・期限超過: ${maskSubjectName(receivable.subjectName)}`,
      message: `${formatAmount(receivable.amount)} が ${agingDays}日超過。至急回収対応が必要です。`,
      severity: agingDays >= 30 || receivable.priority === 'critical' ? 'critical' : 'warning',
      fingerprint: generateFingerprint('receivable_risk', receivable.id, `overdue:${today}`),
      assignedRole: 'manager',
      assignedUserId: receivable.ownerUserId,
      meta: {
        receivableId: receivable.id,
        amount: receivable.amount,
        dueAt: receivable.dueAt,
        agingDays,
        priority: receivable.priority,
        status: receivable.status,
      },
    });
  }

  // 長期滞留（60日以上）
  const longAging = risks.filter((r) => r.riskType === 'long_aging' && r.agingDays >= 60);

  for (const risk of longAging.slice(0, 3)) {
    // 上位3件までアラート
    const { receivable, agingDays } = risk;
    // 既に高額アラートがあれば重複回避
    const alreadyAlerted = highAmountOverdue.some((h) => h.receivable.id === receivable.id);
    if (alreadyAlerted) continue;

    alerts.push({
      type: 'receivable_risk',
      sourceId: receivable.id,
      title: `長期滞留: ${maskSubjectName(receivable.subjectName)}`,
      message: `${formatAmount(receivable.amount)} が ${agingDays}日間未回収。回収方針の見直しを検討してください。`,
      severity: agingDays >= 90 ? 'critical' : 'warning',
      fingerprint: generateFingerprint('receivable_risk', receivable.id, `aging60:${today}`),
      assignedRole: 'manager',
      assignedUserId: receivable.ownerUserId,
      meta: {
        receivableId: receivable.id,
        amount: receivable.amount,
        dueAt: receivable.dueAt,
        agingDays,
        status: receivable.status,
      },
    });
  }

  // 2) 全体サマリーアラート（期限超過総額が50万以上）
  const stats = getStats(DEMO_VIEWER);
  if (stats && stats.overdueTotal >= 500000) {
    alerts.push({
      type: 'receivable_risk',
      sourceId: 'summary',
      title: '未収リスク: 期限超過総額が高水準',
      message: `期限超過総額: ${formatAmount(stats.overdueTotal)}（${stats.overdueCount}件）。未収管理画面で状況を確認してください。`,
      severity: stats.overdueTotal >= 1000000 ? 'critical' : 'warning',
      fingerprint: generateFingerprint('receivable_risk', 'summary', `overdue_total:${today}`),
      assignedRole: 'manager',
      assignedUserId: null,
      meta: {
        overdueTotal: stats.overdueTotal,
        overdueCount: stats.overdueCount,
        criticalOverdueCount: stats.criticalOverdueCount,
      },
    });
  }

  return alerts;
}

/**
 * 未収リスクサマリーを取得
 */
export function getReceivableRiskSummary(): {
  overdueTotal: number;
  overdueCount: number;
  highAmountOverdueCount: number;
  longAgingCount: number;
  totalRisks: number;
} {
  const stats = getStats(DEMO_VIEWER);
  const risks = scanReceivableRisks();

  const highAmountOverdue = risks.filter((r) => r.riskType === 'high_amount').length;
  const longAging = risks.filter((r) => r.riskType === 'long_aging').length;

  return {
    overdueTotal: stats?.overdueTotal ?? 0,
    overdueCount: stats?.overdueCount ?? 0,
    highAmountOverdueCount: highAmountOverdue,
    longAgingCount: longAging,
    totalRisks: risks.length,
  };
}
