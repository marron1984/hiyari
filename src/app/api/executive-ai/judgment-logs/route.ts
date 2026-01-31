// ======== 幹部AI 吉田判断ログAPI ========

import { NextRequest, NextResponse } from 'next/server';
import { getJudgmentLogs, canAccessJudgmentLog } from '@/lib/executive-ai';
import type { ConsultationCategory } from '@/types/executive-ai';

/**
 * GET /api/executive-ai/judgment-logs
 * 吉田判断ログ一覧を取得（読み取り専用）
 *
 * Query Parameters:
 * - tenantId: string (default: 'default')
 * - branchId: string (オプション、自拠点のみフィルタ)
 * - category: ConsultationCategory (オプション)
 * - limit: number (default: 20)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const branchId = searchParams.get('branchId') || undefined;
    const category = searchParams.get('category') as ConsultationCategory | null;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { logs, total } = await getJudgmentLogs(tenantId, {
      branchId,
      category: category || undefined,
      limit,
      offset,
    });

    // 日付をISO文字列に変換
    const formattedLogs = logs.map((log) => ({
      ...log,
      decidedAt: log.decidedAt.toISOString(),
      createdAt: log.createdAt.toISOString(),
      updatedAt: log.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      logs: formattedLogs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[ExecutiveAI/JudgmentLogs] 取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
