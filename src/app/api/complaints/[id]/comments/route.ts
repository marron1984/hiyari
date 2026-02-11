/**
 * クレームコメントAPI
 *
 * GET  /api/complaints/[id]/comments - コメント一覧
 * POST /api/complaints/[id]/comments - コメント追加
 */

import { NextRequest, NextResponse } from 'next/server';
import { getComplaintById, listComments, addComment } from '@/lib/complaints/repo';
import { canEditComplaint } from '@/lib/complaints/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;
    const complaint = getComplaintById(id, { userId: user.uid, role: user.role as AppRole });

    if (!complaint) {
      return NextResponse.json(
        { success: false, error: 'クレームが見つかりません' },
        { status: 404 }
      );
    }

    const comments = listComments(id);

    return NextResponse.json({
      success: true,
      comments,
    });
  } catch (error) {
    console.error('コメント取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'コメントの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;
    const complaint = getComplaintById(id, { userId: user.uid, role: user.role as AppRole });

    if (!complaint) {
      return NextResponse.json(
        { success: false, error: 'クレームが見つかりません' },
        { status: 404 }
      );
    }

    if (!canEditComplaint({ userId: user.uid, role: user.role as AppRole }, complaint)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'メッセージを入力してください' },
        { status: 400 }
      );
    }

    const result = addComment(id, message, user.uid);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      comment: result.comment,
    });
  } catch (error) {
    console.error('コメント追加エラー:', error);
    return NextResponse.json(
      { success: false, error: 'コメントの追加に失敗しました' },
      { status: 500 }
    );
  }
}
