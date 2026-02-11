/**
 * 組織メンバー API
 * GET  /api/org/{id}/members - メンバー一覧
 * POST /api/org/{id}/members - メンバー追加
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import * as repo from '@/lib/org/repo.firestore';
import type { ViewerContext, AddMemberInput } from '@/lib/org/types';
import { canViewOrgTree, canEditMembership } from '@/lib/org/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    if (!canViewOrgTree(viewer.role)) {
      return NextResponse.json(
        { success: false, error: 'メンバーを閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const unit = await repo.getOrgUnitById(id);
    if (!unit) {
      return NextResponse.json(
        { success: false, error: '組織が見つかりません' },
        { status: 404 }
      );
    }

    const members = await repo.listMembers(id);

    return NextResponse.json({ success: true, members });
  } catch (error) {
    console.error('Org Members GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'メンバー一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    if (!canEditMembership(viewer.role)) {
      return NextResponse.json(
        { success: false, error: 'メンバーを追加する権限がありません' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as AddMemberInput;

    if (!body.userId) {
      return NextResponse.json(
        { success: false, error: 'ユーザーIDは必須です' },
        { status: 400 }
      );
    }

    const result = await repo.addMember(id, body, viewer.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, membership: result.membership },
      { status: 201 }
    );
  } catch (error) {
    console.error('Org Members POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'メンバーの追加に失敗しました' },
      { status: 500 }
    );
  }
}
