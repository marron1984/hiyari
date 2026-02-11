/**
 * 外部アカウント一覧・作成 API
 * GET  /api/external-accounts - 一覧取得（admin+）
 * POST /api/external-accounts - 作成（admin/executive）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/external-accounts/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { ViewerContext } from '@/lib/external-accounts/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'active' | 'invited' | 'disabled' | null;
    const role = searchParams.get('role') as string | null;
    const search = searchParams.get('search');

    const users = repo.listExternalUsers(viewer, {
      status: status ?? undefined,
      role: role as repo.ListExternalUsersFilters['role'],
      search: search ?? undefined,
    });

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error('External Accounts GET Error:', error);
    return NextResponse.json(
      { success: false, error: '外部アカウント一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    const body = await request.json();

    const result = repo.createExternalUser(body, viewer);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, user: result.user }, { status: 201 });
  } catch (error) {
    console.error('External Accounts POST Error:', error);
    return NextResponse.json(
      { success: false, error: '外部アカウントの作成に失敗しました' },
      { status: 500 }
    );
  }
}
