/**
 * アラート統計API
 *
 * GET /api/alerts/stats
 */

import { NextResponse } from 'next/server';
import { getAlertStatsAsync } from '@/lib/alerts/repo.firestore';

export async function GET() {
  const stats = await getAlertStatsAsync();

  return NextResponse.json({
    success: true,
    ...stats,
  });
}
