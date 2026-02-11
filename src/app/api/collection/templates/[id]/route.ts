/**
 * 回収フローテンプレート詳細 API
 *
 * GET /api/collection/templates/[id] - 詳細取得
 * PATCH /api/collection/templates/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTemplateById,
  updateTemplate,
  listStepsByTemplate,
} from '@/lib/collection/repo';
import { canViewCollectionFlow, canManageTemplates } from '@/lib/collection/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const template = getTemplateById(id);

    if (!template) {
      return NextResponse.json(
        { error: 'テンプレートが見つかりません' },
        { status: 404 }
      );
    }

    const steps = listStepsByTemplate(id);

    return NextResponse.json({ template, steps });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'テンプレートの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canManageTemplates(user.role as any)) {
      return NextResponse.json(
        { error: '編集権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { name, subjectType, description, isActive } = body;

    const template = updateTemplate(
      id,
      { name, subjectType, description, isActive },
      user.uid
    );

    if (!template) {
      return NextResponse.json(
        { error: 'テンプレートが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: 'テンプレートの更新に失敗しました' },
      { status: 500 }
    );
  }
}
