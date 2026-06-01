/**
 * 申し送り詳細API
 *
 * GET /api/handover/[id] - 詳細取得
 * PATCH /api/handover/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import {
  getHandoverItem,
  updateHandoverItem,
  markHandoverRead,
  listHandoverComments,
  getHandoverReadStats,
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

    // 閲覧時に既読にする
    markHandoverRead(id, currentUser.id);

    // コメント取得
    const comments = listHandoverComments(id);

    // 既読統計（manager以上のみ）
    let readStats = null;
    if (['admin', 'executive', 'manager'].includes(currentUser.role)) {
      readStats = getHandoverReadStats(id);
    }

    return NextResponse.json({
      item,
      comments,
      readStats,
    });
  } catch (error) {
    console.error('handover GET error:', error);
    return NextResponse.json(
      { error: '申し送りの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const result = updateHandoverItem(id, body, currentUser.id, currentUser.role);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === '申し送りが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ item: result.item });
  } catch (error) {
    console.error('handover PATCH error:', error);
    return NextResponse.json(
      { error: '申し送りの更新に失敗しました' },
      { status: 500 }
    );
  }
}
