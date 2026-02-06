/**
 * 返信テンプレート 個別API
 *
 * Ticket 081: 定型メッセージ管理
 *
 * GET /api/reply-templates/[id] - 詳細取得
 * PUT /api/reply-templates/[id] - 更新（admin/manager のみ）
 * DELETE /api/reply-templates/[id] - 削除（admin のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getReplyTemplateById,
  updateReplyTemplate,
  deleteReplyTemplate,
} from '@/lib/replyTemplates/repo';

// デモユーザー（本番では認証から取得）
const DEMO_USER: { userId: string; role: 'admin' | 'manager' | 'staff' } = {
  userId: 'user_manager',
  role: 'manager',
};

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
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

    return NextResponse.json({ template });
  } catch (error) {
    console.error('reply-templates [id] GET error:', error);
    return NextResponse.json(
      { error: 'テンプレートの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 権限チェック
    if (!['admin', 'manager'].includes(DEMO_USER.role)) {
      return NextResponse.json(
        { error: '更新権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const updated = updateReplyTemplate(id, body, DEMO_USER.userId);

    if (!updated) {
      return NextResponse.json(
        { error: 'テンプレートが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ template: updated });
  } catch (error) {
    console.error('reply-templates [id] PUT error:', error);
    return NextResponse.json(
      { error: 'テンプレートの更新に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 権限チェック（削除は admin のみ）
    if (DEMO_USER.role !== 'admin') {
      return NextResponse.json(
        { error: '削除権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const deleted = deleteReplyTemplate(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'テンプレートが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('reply-templates [id] DELETE error:', error);
    return NextResponse.json(
      { error: 'テンプレートの削除に失敗しました' },
      { status: 500 }
    );
  }
}
