/**
 * 同意書本文操作 API
 * POST /api/agreements/documents/{id} - activate または archive
 *   body: { action: 'activate' | 'archive' }
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/agreements/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

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
    const action = body.action as 'activate' | 'archive';

    let result;
    if (action === 'activate') {
      result = repo.setActiveDocument(id, user.uid);
    } else if (action === 'archive') {
      result = repo.archiveDocument(id, user.uid);
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

    return NextResponse.json({ success: true, document: result.document });
  } catch (error) {
    console.error('Agreement Document Action Error:', error);
    return NextResponse.json(
      { success: false, error: '本文操作に失敗しました' },
      { status: 500 }
    );
  }
}
