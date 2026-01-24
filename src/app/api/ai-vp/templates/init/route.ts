import { NextRequest, NextResponse } from 'next/server';
import { initializeAiTemplates, INITIAL_TEMPLATES } from '@/lib/ai-vp-messages';
import { isAiVpOwner } from '@/lib/auth';

/**
 * FAQテンプレート初期化API
 * POST /api/ai-vp/templates/init
 *
 * 吉田のみ実行可能。
 * 20件の初期FAQテンプレートをFirestoreに投入する。
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('Authorization');
    const userEmail = request.headers.get('X-User-Email');

    if (!userEmail || !isAiVpOwner(userEmail)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'AI VP owner access required' },
        { status: 401 }
      );
    }

    // テンプレート初期化
    const result = await initializeAiTemplates(userEmail);

    return NextResponse.json({
      ok: true,
      created: result.created,
      existing: result.existing,
      total: INITIAL_TEMPLATES.length,
      message: `Created ${result.created} templates, ${result.existing} already existed`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 }
    );
  }
}

/**
 * テンプレート一覧確認
 * GET /api/ai-vp/templates/init
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    templateCount: INITIAL_TEMPLATES.length,
    templates: INITIAL_TEMPLATES.map(t => ({
      key: t.key,
      title: t.title,
      category: t.category,
      riskLevel: t.riskLevel,
    })),
  });
}
