/**
 * 回収フローテンプレート API
 *
 * GET /api/collection/templates - 一覧取得
 * POST /api/collection/templates - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { listTemplates, createTemplate } from '@/lib/collection/repo';
import { canViewCollectionFlow, canManageTemplates } from '@/lib/collection/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canViewCollectionFlow(user.role as any)) {
      return NextResponse.json(
        { error: '閲覧権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const templates = listTemplates({ userId: user.uid, role: user.role as any }, activeOnly);

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
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canManageTemplates(user.role as any)) {
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
      user.uid
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
