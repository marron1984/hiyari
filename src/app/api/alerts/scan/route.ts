/**
 * アラートスキャンAPI
 *
 * POST /api/alerts/scan
 * 全ソースをスキャンしてアラートを生成
 */

import { NextResponse } from 'next/server';
import { createAlertsFromScan } from '@/lib/alerts/repo';
import { scanKpiAnomalies } from '@/lib/alerts/scanners/kpi-scanner';
import { scanApprovalBacklog } from '@/lib/alerts/scanners/approval-scanner';
import { scanDeadlines } from '@/lib/alerts/scanners/deadline-scanner';
import { createUnclassifiedAlerts } from '@/lib/scope/createUnclassifiedAlerts';
import type { CreateAlertRequest } from '@/lib/alerts/types';

export async function POST() {
  const allRequests: CreateAlertRequest[] = [];

  // KPI異常スキャン
  const kpiAlerts = scanKpiAnomalies();
  allRequests.push(...kpiAlerts);

  // 承認滞留スキャン
  const approvalAlerts = scanApprovalBacklog();
  allRequests.push(...approvalAlerts);

  // 期限超過スキャン
  const deadlineAlerts = scanDeadlines();
  allRequests.push(...deadlineAlerts);

  // 一括作成
  const result = createAlertsFromScan(allRequests);

  // Task 033: 未分類スコープスキャン（別fingerprint管理のため別処理）
  const unclassifiedResult = createUnclassifiedAlerts();

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
    message: `${result.created + unclassifiedResult.created}件の新規アラートを作成しました（${result.skipped + unclassifiedResult.skipped}件は重複スキップ）`,
  });
}
