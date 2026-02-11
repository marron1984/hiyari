/**
 * クレーム詳細・更新API
 *
 * GET   /api/complaints/[id] - 詳細取得
 * PATCH /api/complaints/[id] - 更新（manager+ or assignee）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getComplaintById,
  updateComplaint,
  listComments,
  listActions,
  getEvents,
} from '@/lib/complaints/repo.firestore';
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
    const complaint = await getComplaintById(id, { userId: user.uid, role: user.role as AppRole });

    if (!complaint) {
      return NextResponse.json(
        { success: false, error: 'クレームが見つかりません' },
        { status: 404 }
      );
    }

    const comments = await listComments(id);
    const actions = await listActions(id);
    const events = await getEvents(id);

    return NextResponse.json({
      success: true,
      complaint,
      comments,
      actions,
      events,
    });
  } catch (error) {
    console.error('クレーム詳細取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クレームの取得に失敗しました' },
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

    const { id } = await params;
    const complaint = await getComplaintById(id, { userId: user.uid, role: user.role as AppRole });

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
    const result = await updateComplaint(id, body, user.uid);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      complaint: result.complaint,
    });
  } catch (error) {
    console.error('クレーム更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クレームの更新に失敗しました' },
      { status: 500 }
    );
  }
}
