// ======== テンプレート改善提案個別操作 API ========

import { NextRequest, NextResponse } from 'next/server';
import {
  getSuggestion,
  acceptSuggestion,
  rejectSuggestion,
} from '@/lib/template-improvement';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/admin/template-suggestions/[id]
 * 提案の詳細を取得
 */
export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;

    // 提案を取得
    const suggestion = await getSuggestion(id);
    if (!suggestion) {
      return NextResponse.json({ error: '提案が見つかりません' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      suggestion: {
        ...suggestion,
        createdAt: suggestion.createdAt.toISOString(),
        expiresAt: suggestion.expiresAt.toISOString(),
        reviewedAt: suggestion.reviewedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('[TemplateSuggestion] 取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/template-suggestions/[id]
 * 提案を承認または見送り
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;

    // 提案を取得
    const suggestion = await getSuggestion(id);
    if (!suggestion) {
      return NextResponse.json({ error: '提案が見つかりません' }, { status: 404 });
    }

    // リクエストボディ
    const body = await request.json();
    const { action, note } = body as { action: 'accept' | 'reject'; note?: string };

    if (!action || !['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action は accept または reject を指定してください' },
        { status: 400 }
      );
    }

    // アクション実行（管理者情報は簡易的に設定）
    let result: { success: boolean; error?: string };

    if (action === 'accept') {
      result = await acceptSuggestion(id, 'admin', '管理者', note);
    } else {
      result = await rejectSuggestion(id, 'admin', '管理者', note);
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: action === 'accept' ? '提案を採用しました' : '提案を見送りました',
    });
  } catch (error) {
    console.error('[TemplateSuggestion] 操作エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '操作に失敗しました',
      },
      { status: 500 }
    );
  }
}
