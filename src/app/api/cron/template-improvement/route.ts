// ======== テンプレート改善提案生成バッチ API ========

import { NextRequest, NextResponse } from 'next/server';
import { generateAllSuggestions } from '@/lib/template-improvement';

/**
 * POST /api/cron/template-improvement
 * 全テナントのテンプレート改善提案を生成（定期バッチ用）
 */
export async function POST(request: NextRequest) {
  try {
    // Cron認証（Vercel Cron等）
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: '認証エラー' },
        { status: 401 }
      );
    }

    console.log('[TemplateImprovement Cron] バッチ開始');

    const result = await generateAllSuggestions();

    console.log('[TemplateImprovement Cron] バッチ完了', result);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[TemplateImprovement Cron] エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/template-improvement
 * ヘルスチェック用
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'template-improvement',
    description: 'テンプレート改善提案生成バッチ',
  });
}
