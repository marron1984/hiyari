/**
 * クレームリスク検出
 *
 * クレームの重要案件・期限超過を検出してアラートを生成
 */

import type { CreateAlertRequest } from '@/lib/alerts/types';
import { generateFingerprint } from '@/lib/alerts/types';
import { scanCriticalOpen, scanOverdue } from './repo';

/**
 * クレームリスクをスキャンしてアラートリクエストを生成
 */
export function detectComplaintRisks(): CreateAlertRequest[] {
  const alerts: CreateAlertRequest[] = [];

  // 1) critical/high で未解決のクレーム
  const criticalComplaints = scanCriticalOpen();
  for (const complaint of criticalComplaints) {
    const severity = complaint.severity === 'critical' ? 'critical' : 'warning';
    alerts.push({
      type: 'complaint_risk',
      sourceId: complaint.id,
      title: `重要クレーム未解決: ${complaint.title}`,
      message: `重要度「${complaint.severity === 'critical' ? '重大' : '高'}」のクレームが未解決です。至急対応が必要です。`,
      severity,
      fingerprint: generateFingerprint('complaint_risk', complaint.id, 'critical_open'),
      assignedRole: 'manager',
      assignedUserId: complaint.assigneeUserId,
      meta: {
        complaintId: complaint.id,
        complaintSeverity: complaint.severity,
        status: complaint.status,
        category: complaint.category,
        receivedAt: complaint.receivedAt,
      },
    });
  }

  // 2) 期限超過のクレーム
  const overdueComplaints = scanOverdue();
  for (const complaint of overdueComplaints) {
    // 既にcriticalアラートがあれば期限超過はskip（重複回避）
    const alreadyCritical = criticalComplaints.some((c) => c.id === complaint.id);
    if (alreadyCritical) continue;

    const daysOverdue = complaint.dueAt
      ? Math.floor(
          (Date.now() - new Date(complaint.dueAt).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    alerts.push({
      type: 'complaint_risk',
      sourceId: complaint.id,
      title: `クレーム期限超過: ${complaint.title}`,
      message: `対応期限を${daysOverdue}日超過しています。早急に対応を進めてください。`,
      severity: daysOverdue >= 7 ? 'critical' : 'warning',
      fingerprint: generateFingerprint('complaint_risk', complaint.id, 'overdue'),
      assignedRole: 'manager',
      assignedUserId: complaint.assigneeUserId,
      meta: {
        complaintId: complaint.id,
        dueAt: complaint.dueAt,
        daysOverdue,
        status: complaint.status,
      },
    });
  }

  return alerts;
}

/**
 * クレームリスクサマリーを取得
 */
export function getComplaintRiskSummary(): {
  criticalOpenCount: number;
  overdueCount: number;
  totalRisks: number;
} {
  const criticalOpen = scanCriticalOpen();
  const overdue = scanOverdue();

  // 重複を除外したリスク総数
  const overdueNotCritical = overdue.filter(
    (o) => !criticalOpen.some((c) => c.id === o.id)
  );

  return {
    criticalOpenCount: criticalOpen.length,
    overdueCount: overdueNotCritical.length,
    totalRisks: criticalOpen.length + overdueNotCritical.length,
  };
}
