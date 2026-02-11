/**
 * アラート一覧API
 *
 * GET /api/alerts?status=open&severity=critical&type=kpi_anomaly
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAlertsAsync } from '@/lib/alerts/repo.firestore';
import type { AlertStatus, AlertSeverity, AlertType } from '@/lib/alerts/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const status = searchParams.get('status') as AlertStatus | null;
  const severity = searchParams.get('severity') as AlertSeverity | null;
  const type = searchParams.get('type') as AlertType | null;
  const limit = searchParams.get('limit')
    ? parseInt(searchParams.get('limit')!, 10)
    : undefined;
  const offset = searchParams.get('offset')
    ? parseInt(searchParams.get('offset')!, 10)
    : undefined;

  const result = await listAlertsAsync({
    status: status ?? undefined,
    severity: severity ?? undefined,
    type: type ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({
    success: true,
    ...result,
  });
}
