/**
 * 返信テンプレート API
 *
 * Ticket 081: 定型メッセージ管理
 *
 * GET /api/reply-templates - 一覧取得
 * POST /api/reply-templates - 新規作成（admin/manager のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import {
  listReplyTemplates,
  createReplyTemplate,
  seedReplyTemplatesIfEmpty,
} from '@/lib/replyTemplates/repo';
import type { ReplyTemplateCategory } from '@/lib/replyTemplates/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // シードデータ初期化
    seedReplyTemplatesIfEmpty();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as ReplyTemplateCategory | null;
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const search = searchParams.get('search') ?? undefined;

    const templates = listReplyTemplates({
      category: category ?? undefined,
      activeOnly,
      search,
    });

    return NextResponse.json({
      templates,
      totalCount: templates.length,
    });
  } catch (error) {
    console.error('reply-templates GET error:', error);
    return NextResponse.json(
      { error: 'テンプレート一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェック
    if (!['admin', 'manager'].includes(currentUser.role)) {
      return NextResponse.json(
        { error: '作成権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { key, name, category, description, subject, content, variablesJson, isActive, sortOrder } = body;

    // バリデーション
    if (!key || !name || !category || !content) {
      return NextResponse.json(
        { error: 'key, name, category, content は必須です' },
        { status: 400 }
      );
    }

    const template = createReplyTemplate(
      {
        key,
        name,
        category,
        description,
        subject,
        content,
        variablesJson,
        isActive,
        sortOrder,
      },
      currentUser.id
    );

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('reply-templates POST error:', error);
    return NextResponse.json(
      { error: 'テンプレートの作成に失敗しました' },
      { status: 500 }
    );
  }
}
