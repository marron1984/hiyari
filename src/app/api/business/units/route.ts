/**
 * 事業単位一覧 API
 * GET  /api/business/units - 一覧取得
 * POST /api/business/units - 作成（admin）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/business/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const units = repo.listBusinessUnits(activeOnly);

    return NextResponse.json({ success: true, units });
  } catch (error) {
    console.error('Business Units GET Error:', error);
    return NextResponse.json(
      { success: false, error: '事業一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const body = await request.json();

    const result = repo.createBusinessUnit(
      {
        name: body.name,
        type: body.type,
        locationHint: body.locationHint,
        ownerUserId: body.ownerUserId,
      },
      user.uid
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, unit: result.unit }, { status: 201 });
  } catch (error) {
    console.error('Business Units POST Error:', error);
    return NextResponse.json(
      { success: false, error: '事業の作成に失敗しました' },
      { status: 500 }
    );
  }
}
