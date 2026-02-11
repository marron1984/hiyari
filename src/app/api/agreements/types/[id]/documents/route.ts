/**
 * 同意書本文（版）API
 * GET  /api/agreements/types/{id}/documents - 一覧取得
 * POST /api/agreements/types/{id}/documents - 作成（admin）
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
    const documents = repo.listDocuments(id);
    return NextResponse.json({ success: true, documents });
  } catch (error) {
    console.error('Agreement Documents GET Error:', error);
    return NextResponse.json(
      { success: false, error: '本文の取得に失敗しました' },
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
    const body = await request.json();

    const result = repo.createDocument(
      id,
      {
        templateKey: body.templateKey,
        templateVersion: body.templateVersion,
        titleOverride: body.titleOverride,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo,
      },
      user.uid
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, document: result.document }, { status: 201 });
  } catch (error) {
    console.error('Agreement Documents POST Error:', error);
    return NextResponse.json(
      { success: false, error: '本文の作成に失敗しました' },
      { status: 500 }
    );
  }
}
