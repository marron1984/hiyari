/**
 * アラート統計API
 *
 * GET /api/alerts/stats
 */

import { NextResponse } from 'next/server';
import { getAlertStats } from '@/lib/alerts/repo';

export async function GET() {
  const stats = getAlertStats();

  return NextResponse.json({
    success: true,
    ...stats,
  });
}
