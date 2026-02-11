/**
 * 同意レコード API
 * GET  /api/agreements/consents - 一覧取得（manager+）
 * POST /api/agreements/consents - 記録（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/agreements/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { ViewerContext, SubjectType, ConsentStatus } from '@/lib/agreements/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);
    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    const agreementTypeId = searchParams.get('agreementTypeId') ?? undefined;
    const subjectType = searchParams.get('subjectType') as SubjectType | null;
    const consentStatus = searchParams.get('consentStatus') as ConsentStatus | null;
    const expiringWithinDays = searchParams.get('expiringWithinDays');
    const expired = searchParams.get('expired');
    const q = searchParams.get('q') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const result = repo.listConsents(viewer, {
      agreementTypeId,
      subjectType: subjectType ?? undefined,
      consentStatus: consentStatus ?? undefined,
      expiringWithinDays: expiringWithinDays ? parseInt(expiringWithinDays, 10) : undefined,
      expired: expired === 'true' ? true : undefined,
      q,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      consents: result.consents,
      total: result.total,
    });
  } catch (error) {
    console.error('Consents GET Error:', error);
    return NextResponse.json(
      { success: false, error: '同意レコードの取得に失敗しました' },
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

    const result = repo.recordConsent(
      {
        agreementTypeId: body.agreementTypeId,
        subjectType: body.subjectType,
        subjectId: body.subjectId,
        subjectName: body.subjectName,
        consentStatus: body.consentStatus,
        method: body.method,
        note: body.note,
        consentedAt: body.consentedAt,
        validUntil: body.validUntil,
      },
      user.uid
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, consent: result.consent }, { status: 201 });
  } catch (error) {
    console.error('Consents POST Error:', error);
    return NextResponse.json(
      { success: false, error: '同意レコードの記録に失敗しました' },
      { status: 500 }
    );
  }
}
