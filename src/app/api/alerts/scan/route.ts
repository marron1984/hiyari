/**
 * アラートスキャンAPI
 *
 * POST /api/alerts/scan
 * 全ソースをスキャンしてアラートを生成
 */

import { NextResponse } from 'next/server';
import { createAlertsFromScanAsync } from '@/lib/alerts/repo.firestore';
import { scanKpiAnomalies } from '@/lib/alerts/scanners/kpi-scanner';
import { scanApprovalBacklog } from '@/lib/alerts/scanners/approval-scanner';
import { scanDeadlines } from '@/lib/alerts/scanners/deadline-scanner';
import { createUnclassifiedAlerts, getUnclassifiedCounts } from '@/lib/scope/createUnclassifiedAlerts';
import { createUnclassifiedScopeNotification } from '@/lib/notifications/repo';
import type { CreateAlertRequest } from '@/lib/alerts/types';

export async function POST() {
  const allRequests: CreateAlertRequest[] = [];

  // KPI異常スキャン
  const kpiAlerts = scanKpiAnomalies();
  allRequests.push(...kpiAlerts);

  // 承認滞留スキャン
  const approvalAlerts = await scanApprovalBacklog();
  allRequests.push(...approvalAlerts);

  // 期限超過スキャン
  const deadlineAlerts = await scanDeadlines();
  allRequests.push(...deadlineAlerts);

  // 一括作成
  const result = await createAlertsFromScanAsync(allRequests);

  // Task 033: 未分類スコープスキャン（別fingerprint管理のため別処理）
  const unclassifiedResult = await createUnclassifiedAlerts();

  // Task 033: 未分類通知も作成
  let notificationCreated = false;
  if (unclassifiedResult.created > 0) {
    const counts = await getUnclassifiedCounts();
    const notification = createUnclassifiedScopeNotification(counts);
    notificationCreated = notification !== null;
  }

  return NextResponse.json({
    success: true,
    scanned: {
      kpi: kpiAlerts.length,
      approval: approvalAlerts.length,
      deadline: deadlineAlerts.length,
      unclassified: unclassifiedResult.entityTypes.length,
    },
    created: result.created + unclassifiedResult.created,
    skipped: result.skipped + unclassifiedResult.skipped,
    notificationCreated,
    message: `${result.created + unclassifiedResult.created}件の新規アラートを作成しました（${result.skipped + unclassifiedResult.skipped}件は重複スキップ）`,
  });
}
