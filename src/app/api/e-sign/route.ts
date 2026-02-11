/**
 * 電子署名ログ API
 *
 * GET  /api/e-sign - 一覧取得
 * POST /api/e-sign - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/esign/repo.firestore';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { ListESignRecordsFilter, SignStatus, SubjectType, SignMethod, ExternalProvider } from '@/lib/esign/types';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: repo.ViewerContext = {
      userId: user.uid,
      role: user.role as AppRole,
    };

    const { searchParams } = new URL(request.url);

    const filter: ListESignRecordsFilter = {
      status: (searchParams.get('status') as SignStatus) || undefined,
      subjectType: (searchParams.get('subjectType') as SubjectType) || undefined,
      documentId: searchParams.get('documentId') || undefined,
      q: searchParams.get('q') || undefined,
      limit: parseInt(searchParams.get('limit') ?? '50', 10),
      offset: parseInt(searchParams.get('offset') ?? '0', 10),
    };

    const expiringWithinDays = searchParams.get('expiringWithinDays');
    if (expiringWithinDays) {
      filter.expiringWithinDays = parseInt(expiringWithinDays, 10);
    }

    const result = await repo.listESignRecords(viewer, filter);

    return NextResponse.json({
      success: true,
      records: result.records,
      total: result.total,
    });
  } catch (error) {
    console.error('[E-Sign API] GET error:', error);
    return NextResponse.json(
      { success: false, error: '電子署名ログの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: repo.ViewerContext = {
      userId: user.uid,
      role: user.role as AppRole,
    };

    const body = await request.json();

    // バリデーション
    if (!body.subjectType) {
      return NextResponse.json(
        { success: false, error: 'subjectType は必須です' },
        { status: 400 }
      );
    }
    if (!body.subjectName) {
      return NextResponse.json(
        { success: false, error: 'subjectName は必須です' },
        { status: 400 }
      );
    }
    if (!body.method) {
      return NextResponse.json(
        { success: false, error: 'method は必須です' },
        { status: 400 }
      );
    }

    const result = await repo.createESignRecord(
      {
        subjectType: body.subjectType as SubjectType,
        subjectId: body.subjectId || null,
        subjectName: body.subjectName,
        documentId: body.documentId || null,
        documentVersionId: body.documentVersionId || null,
        agreementConsentId: body.agreementConsentId || null,
        contractId: body.contractId || null,
        method: body.method as SignMethod,
        status: body.status as SignStatus | undefined,
        requestedAt: body.requestedAt || null,
        signedAt: body.signedAt || null,
        expiresAt: body.expiresAt || null,
        note: body.note || null,
        externalProvider: (body.externalProvider as ExternalProvider) || 'none',
        externalEnvelopeId: body.externalEnvelopeId || null,
      },
      viewer.userId,
      viewer.role
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, record: result.record },
      { status: 201 }
    );
  } catch (error) {
    console.error('[E-Sign API] POST error:', error);
    return NextResponse.json(
      { success: false, error: '電子署名ログの作成に失敗しました' },
      { status: 500 }
    );
  }
}
