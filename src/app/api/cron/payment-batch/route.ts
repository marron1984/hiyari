// /api/cron/payment-batch - 失敗支払いリトライバッチ
// Vercel Cron: 毎日 JST 03:00 (UTC 18:00)

import { NextRequest, NextResponse } from 'next/server';
import { retryFailedPayments } from '@/lib/payment';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Vercel Cron認証ヘッダー
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET: 失敗した支払いをリトライ
 */
export async function GET(request: NextRequest) {
  try {
    // Cron認証（Vercel Cron or 手動実行）
    const authHeader = request.headers.get('authorization');
    const cronSecret = request.headers.get('x-vercel-cron-secret');

    // 本番環境ではCRON_SECRETで認証
    if (process.env.NODE_ENV === 'production') {
      if (cronSecret !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('[PaymentBatch] 失敗支払いリトライバッチ開始');

    const result = await retryFailedPayments();

    console.log('[PaymentBatch] バッチ完了', result);

    return NextResponse.json({
      success: true,
      message: '失敗支払いリトライバッチが完了しました',
      result,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PaymentBatch] バッチエラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
