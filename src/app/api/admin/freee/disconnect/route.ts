// ======== freee連携解除 ========

import { NextRequest, NextResponse } from 'next/server';
import { disconnectFreee } from '@/lib/freee-token';

/**
 * POST /api/admin/freee/disconnect
 * freee連携を解除
 */
export async function POST(request: NextRequest) {
  try {
    await disconnectFreee();

    console.log('[freee/disconnect] 連携解除完了');

    return NextResponse.json({
      success: true,
      message: 'freee連携を解除しました',
    });
  } catch (error) {
    console.error('[freee/disconnect] エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '連携解除に失敗しました',
      },
      { status: 500 }
    );
  }
}
