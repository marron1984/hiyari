/**
 * 申し送りコメントAPI
 *
 * GET /api/handover/[id]/comments - コメント一覧
 * POST /api/handover/[id]/comments - コメント追加
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import {
  getHandoverItem,
  listHandoverComments,
  addHandoverComment,
} from '@/lib/handover/repo';
import { isUserTargeted } from '@/lib/handover/getHandoverTargetUserIds';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const item = getHandoverItem(id);

    if (!item) {
      return NextResponse.json(
        { error: '申し送りが見つかりません' },
        { status: 404 }
      );
    }

    // アクセス制御
    if (!isUserTargeted(item, currentUser.id, currentUser.role)) {
      return NextResponse.json(
        { error: 'この申し送りを閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const comments = listHandoverComments(id);

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('handover comments GET error:', error);
    return NextResponse.json(
      { error: 'コメントの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const { message } = body;
    if (!message) {
      return NextResponse.json(
        { error: 'メッセージは必須です' },
        { status: 400 }
      );
    }

    const item = getHandoverItem(id);
    if (!item) {
      return NextResponse.json(
        { error: '申し送りが見つかりません' },
        { status: 404 }
      );
    }

    // アクセス制御
    if (!isUserTargeted(item, currentUser.id, currentUser.role)) {
      return NextResponse.json(
        { error: 'この申し送りにコメントする権限がありません' },
        { status: 403 }
      );
    }

    const result = addHandoverComment(id, message, currentUser.id, currentUser.name);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ comment: result.comment }, { status: 201 });
  } catch (error) {
    console.error('handover comments POST error:', error);
    return NextResponse.json(
      { error: 'コメントの追加に失敗しました' },
      { status: 500 }
    );
  }
}
