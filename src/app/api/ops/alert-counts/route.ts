/**
 * Ops アラート件数取得 API
 *
 * Implementation Ticket 067: ops-report 連動
 *
 * GET /api/ops/alert-counts
 *   - system_error (open)
 *   - unclassified (open)
 *   - critical (open)
 *   - total open
 */

import { NextResponse } from 'next/server';
import { listAlerts, getAlertStats } from '@/lib/alerts/repo';

export async function GET() {
  try {
    const stats = getAlertStats();

    // system_error の open 件数
    const systemErrorAlerts = listAlerts({
      type: 'system_error',
      status: 'open',
      limit: 1000,
    });

    // unclassified の open 件数（両方のタイプをカウント）
    const unclassifiedAlerts1 = listAlerts({
      type: 'business_scope_unclassified',
      status: 'open',
      limit: 1000,
    });
    const unclassifiedAlerts2 = listAlerts({
      type: 'unclassified_scope',
      status: 'open',
      limit: 1000,
    });

    return NextResponse.json({
      systemError: systemErrorAlerts.total,
      unclassified: unclassifiedAlerts1.total + unclassifiedAlerts2.total,
      critical: stats.criticalOpen,
      total: stats.open,
    });
  } catch (error) {
    console.error('[OpsAlertCounts] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
