/**
 * 申し送り解決API
 *
 * POST /api/handover/[id]/resolve
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveHandoverItem } from '@/lib/handover/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;

    const result = resolveHandoverItem(id, user.uid, user.role as AppRole);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === '申し送りが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ item: result.item });
  } catch (error) {
    console.error('handover resolve POST error:', error);
    return NextResponse.json(
      { error: '解決に失敗しました' },
      { status: 500 }
    );
  }
}
