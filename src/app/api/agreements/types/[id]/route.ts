/**
 * 同意書種別詳細 API
 * GET   /api/agreements/types/{id} - 詳細取得
 * PATCH /api/agreements/types/{id} - 更新（admin）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/agreements/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const { id } = await params;
    const agreementType = repo.getAgreementTypeById(id);

    if (!agreementType) {
      return NextResponse.json(
        { success: false, error: '同意書種別が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, type: agreementType });
  } catch (error) {
    console.error('Agreement Type GET Error:', error);
    return NextResponse.json(
      { success: false, error: '同意書種別の取得に失敗しました' },
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

    const result = repo.updateAgreementType(id, body, user.uid);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, type: result.type });
  } catch (error) {
    console.error('Agreement Type PATCH Error:', error);
    return NextResponse.json(
      { success: false, error: '同意書種別の更新に失敗しました' },
      { status: 500 }
    );
  }
}
