/**
 * 外部アカウント詳細・更新 API
 * GET   /api/external-accounts/{id} - 詳細取得
 * PATCH /api/external-accounts/{id} - 更新
 * POST  /api/external-accounts/{id} - アクション（disable/activate）
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

    const extUser = repo.getExternalUserById(id, viewer);

    if (!extUser) {
      return NextResponse.json(
        { success: false, error: '外部アカウントが見つかりません' },
        { status: 404 }
      );
    }

    // アクセスポリシーも取得
    const policy = repo.getAccessPolicy(id);

    return NextResponse.json({ success: true, user: extUser, policy });
  } catch (error) {
    console.error('External Account GET Error:', error);
    return NextResponse.json(
      { success: false, error: '外部アカウントの取得に失敗しました' },
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
    const result = repo.updateExternalUser(id, body, viewer);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, user: result.user });
  } catch (error) {
    console.error('External Account PATCH Error:', error);
    return NextResponse.json(
      { success: false, error: '外部アカウントの更新に失敗しました' },
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
    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    const body = await request.json();
    const action = body.action as 'disable' | 'activate';

    let result;
    if (action === 'disable') {
      result = repo.disableExternalUser(id, viewer);
    } else if (action === 'activate') {
      result = repo.activateExternalUser(id, viewer);
    } else {
      return NextResponse.json(
        { success: false, error: '無効なアクションです' },
        { status: 400 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // 更新後のユーザーを取得して返す
    const extUser = repo.getExternalUserById(id, viewer);

    return NextResponse.json({ success: true, user: extUser });
  } catch (error) {
    console.error('External Account Action Error:', error);
    return NextResponse.json(
      { success: false, error: 'アクションの実行に失敗しました' },
      { status: 500 }
    );
  }
}
