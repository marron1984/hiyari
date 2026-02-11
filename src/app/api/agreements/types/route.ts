/**
 * 同意書種別 API
 * GET  /api/agreements/types - 一覧取得
 * POST /api/agreements/types - 作成（admin）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/agreements/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AgreementCategory } from '@/lib/agreements/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') ?? undefined;
    const category = searchParams.get('category') as AgreementCategory | null;
    const activeParam = searchParams.get('active');
    const active = activeParam === 'true' ? true : activeParam === 'false' ? false : undefined;

    const types = repo.listAgreementTypes({
      q,
      category: category ?? undefined,
      active,
    });

    return NextResponse.json({ success: true, types });
  } catch (error) {
    console.error('Agreement Types GET Error:', error);
    return NextResponse.json(
      { success: false, error: '同意書種別の取得に失敗しました' },
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

    const result = repo.createAgreementType(
      {
        key: body.key,
        title: body.title,
        description: body.description,
        category: body.category,
        requiresRenewal: body.requiresRenewal,
        defaultValidDays: body.defaultValidDays,
        defaultWarnDays: body.defaultWarnDays,
      },
      user.uid
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, type: result.type }, { status: 201 });
  } catch (error) {
    console.error('Agreement Types POST Error:', error);
    return NextResponse.json(
      { success: false, error: '同意書種別の作成に失敗しました' },
      { status: 500 }
    );
  }
}
