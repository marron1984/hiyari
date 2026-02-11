/**
 * 家族連絡ログ詳細 API
 *
 * GET   /api/family-contact/[id] - 詳細取得
 * PATCH /api/family-contact/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { getFamilyLogById, updateFamilyLog } from '@/lib/familyLog/repo';
import { canEditFamilyLog } from '@/lib/familyLog/types';
import type { AppRole } from '@/config/appRoles';
import type { UpdateFamilyLogRequest, ViewerContext } from '@/lib/familyLog/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as AppRole,
    };

    const { id } = await params;
    const log = getFamilyLogById(id, viewer);

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
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as AppRole,
    };

    const { id } = await params;
    const log = getFamilyLogById(id, viewer);

    if (!log) {
      return NextResponse.json(
        { error: '連絡ログが見つかりません' },
        { status: 404 }
      );
    }

    // 権限チェック
    if (!canEditFamilyLog(log, viewer)) {
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

    const updated = updateFamilyLog(id, updateRequest, user.uid);

    return NextResponse.json({ log: updated });
  } catch (error) {
    console.error('Error updating family log:', error);
    return NextResponse.json(
      { error: '連絡ログの更新に失敗しました' },
      { status: 500 }
    );
  }
}
