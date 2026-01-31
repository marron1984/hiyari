// ======== freee連携ステータス ========

import { NextRequest, NextResponse } from 'next/server';
import { getFreeeIntegration } from '@/lib/freee-token';

/**
 * GET /api/admin/freee/status
 * freee連携ステータスを取得
 */
export async function GET(request: NextRequest) {
  try {
    const integration = await getFreeeIntegration();

    if (!integration) {
      return NextResponse.json({
        success: true,
        connected: false,
      });
    }

    return NextResponse.json({
      success: true,
      connected: integration.connected,
      companyId: integration.companyId,
      companyName: integration.companyName,
      connectedAt: integration.connectedAt?.toISOString(),
      connectedBy: integration.connectedBy,
      connectedByName: integration.connectedByName,
      lastSyncAt: integration.lastSyncAt?.toISOString(),
      lastError: integration.lastError,
      tokenExpiresAt: integration.tokenExpiresAt?.toISOString(),
    });
  } catch (error) {
    console.error('[freee/status] エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'ステータス取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
