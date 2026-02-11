/**
 * 外部アカウントアクセスポリシー API
 * GET   /api/external-accounts/{id}/policy - ポリシー取得
 * PATCH /api/external-accounts/{id}/policy - ポリシー更新
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/external-accounts/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { ViewerContext } from '@/lib/external-accounts/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;
    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    // ユーザー存在確認
    const extUser = repo.getExternalUserById(id, viewer);
    if (!extUser) {
      return NextResponse.json(
        { success: false, error: '外部アカウントが見つかりません' },
        { status: 404 }
      );
    }

    const policy = repo.getAccessPolicy(id);

    if (!policy) {
      return NextResponse.json(
        { success: false, error: 'アクセスポリシーが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, policy });
  } catch (error) {
    console.error('External Account Policy GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'アクセスポリシーの取得に失敗しました' },
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
    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    const body = await request.json();
    const result = repo.updateAccessPolicy(id, body, viewer);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, policy: result.policy });
  } catch (error) {
    console.error('External Account Policy PATCH Error:', error);
    return NextResponse.json(
      { success: false, error: 'アクセスポリシーの更新に失敗しました' },
      { status: 500 }
    );
  }
}
