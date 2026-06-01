/**
 * 家族連絡ログ詳細 API
 *
 * GET   /api/family-contact/[id] - 詳細取得
 * PATCH /api/family-contact/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getFamilyLogById, updateFamilyLog } from '@/lib/familyLog/repo';
import { canEditFamilyLog } from '@/lib/familyLog/types';
import type { UpdateFamilyLogRequest, ViewerContext } from '@/lib/familyLog/types';

// デモユーザー
const currentUser: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

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
    const log = getFamilyLogById(id, currentUser);

    if (!log) {
      return NextResponse.json(
        { error: '連絡ログが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ log });
  } catch (error) {
    console.error('Error fetching family log:', error);
    return NextResponse.json(
      { error: '連絡ログの取得に失敗しました' },
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
    const log = getFamilyLogById(id, currentUser);

    if (!log) {
      return NextResponse.json(
        { error: '連絡ログが見つかりません' },
        { status: 404 }
      );
    }

    // 権限チェック
    if (!canEditFamilyLog(log, currentUser)) {
      return NextResponse.json(
        { error: '編集権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const updateRequest: UpdateFamilyLogRequest = {};

    if (body.contactType !== undefined) updateRequest.contactType = body.contactType;
    if (body.direction !== undefined) updateRequest.direction = body.direction;
    if (body.category !== undefined) updateRequest.category = body.category;
    if (body.importance !== undefined) updateRequest.importance = body.importance;
    if (body.counterpartName !== undefined) updateRequest.counterpartName = body.counterpartName;
    if (body.counterpartRelation !== undefined) updateRequest.counterpartRelation = body.counterpartRelation;
    if (body.summary !== undefined) updateRequest.summary = body.summary;
    if (body.detail !== undefined) updateRequest.detail = body.detail;
    if (body.occurredAt !== undefined) updateRequest.occurredAt = body.occurredAt;
    if (body.relatedType !== undefined) updateRequest.relatedType = body.relatedType;
    if (body.relatedId !== undefined) updateRequest.relatedId = body.relatedId;

    const updated = updateFamilyLog(id, updateRequest, currentUser.id);

    return NextResponse.json({ log: updated });
  } catch (error) {
    console.error('Error updating family log:', error);
    return NextResponse.json(
      { error: '連絡ログの更新に失敗しました' },
      { status: 500 }
    );
  }
}
