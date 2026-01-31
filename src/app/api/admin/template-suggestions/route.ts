// ======== テンプレート改善提案管理 API ========

import { NextRequest, NextResponse } from 'next/server';
import { listSuggestions } from '@/lib/template-improvement';
import type { TemplateSuggestion } from '@/types/template-improvement';

const DEFAULT_TENANT_ID = 'defaultTenant';

/**
 * GET /api/admin/template-suggestions
 * 改善提案一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    // クエリパラメータ
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as TemplateSuggestion['status'] | null;

    // 提案一覧を取得
    const suggestions = await listSuggestions(DEFAULT_TENANT_ID, status || undefined);

    return NextResponse.json({
      success: true,
      suggestions: suggestions.map(s => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        reviewedAt: s.reviewedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[TemplateSuggestions] 一覧取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
