/**
 * 回収フローテンプレート API
 *
 * GET /api/collection/templates - 一覧取得
 * POST /api/collection/templates - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { listTemplates, createTemplate } from '@/lib/collection/repo';
import { canViewCollectionFlow, canManageTemplates } from '@/lib/collection/types';
import type { ViewerContext } from '@/lib/collection/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET(request: NextRequest) {
  try {
    if (!canViewCollectionFlow(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '閲覧権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const templates = listTemplates(DEMO_VIEWER, activeOnly);

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'テンプレート一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!canManageTemplates(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '作成権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, subjectType, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name は必須です' },
        { status: 400 }
      );
    }

    const template = createTemplate(
      { name, subjectType, description },
      DEMO_VIEWER.userId
    );

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'テンプレートの作成に失敗しました' },
      { status: 500 }
    );
  }
}
