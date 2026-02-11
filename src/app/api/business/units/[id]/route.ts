/**
 * 事業単位詳細 API
 * GET   /api/business/units/{id} - 詳細取得
 * PATCH /api/business/units/{id} - 更新（admin）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/business/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const { id } = await params;
    const unit = repo.getBusinessUnitById(id);

    if (!unit) {
      return NextResponse.json(
        { success: false, error: '事業が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, unit });
  } catch (error) {
    console.error('Business Unit GET Error:', error);
    return NextResponse.json(
      { success: false, error: '事業の取得に失敗しました' },
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
    const body = await request.json();

    const result = repo.updateBusinessUnit(id, body, user.uid);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, unit: result.unit });
  } catch (error) {
    console.error('Business Unit PATCH Error:', error);
    return NextResponse.json(
      { success: false, error: '事業の更新に失敗しました' },
      { status: 500 }
    );
  }
}
