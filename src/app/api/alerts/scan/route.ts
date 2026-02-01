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

  return NextResponse.json({
    success: true,
    scanned: {
      kpi: kpiAlerts.length,
      approval: approvalAlerts.length,
      deadline: deadlineAlerts.length,
    },
    created: result.created,
    skipped: result.skipped,
    message: `${result.created}件の新規アラートを作成しました（${result.skipped}件は重複スキップ）`,
  });
}
