/**
 * テンプレート変数展開 API
 *
 * Ticket 081: 定型メッセージ管理
 *
 * POST /api/reply-templates/[id]/expand - 変数を展開して返す
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getReplyTemplateById,
  expandTemplate,
} from '@/lib/replyTemplates/repo';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const template = getReplyTemplateById(id);

    if (!template) {
      return NextResponse.json(
        { error: 'テンプレートが見つかりません' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const variables: Record<string, string> = body.variables || {};

    const expanded = expandTemplate(template, variables);

    return NextResponse.json({
      subject: expanded.subject,
      content: expanded.content,
      missingVariables: expanded.missingVariables,
      template: {
        id: template.id,
        name: template.name,
        variablesJson: template.variablesJson,
      },
    });
  } catch (error) {
    console.error('reply-templates expand error:', error);
    return NextResponse.json(
      { error: 'テンプレートの展開に失敗しました' },
      { status: 500 }
    );
  }
}
