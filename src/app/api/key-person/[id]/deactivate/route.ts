/**
 * キーパーソン無効化 API
 *
 * POST /api/key-person/[id]/deactivate
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, deactivateContact } from '@/lib/keyPerson/repo.firestore';
import { canEditKeyPerson } from '@/lib/keyPerson/types';
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

    // 権限チェック
    if (!canEditKeyPerson(user.role as AppRole)) {
      return NextResponse.json(
        { error: '編集権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contact = await getById(id, { userId: user.uid, role: user.role as AppRole });

    if (!contact) {
      return NextResponse.json(
        { error: '連絡先が見つかりません' },
        { status: 404 }
      );
    }

    const deactivated = await deactivateContact(id, user.uid);

    return NextResponse.json({ contact: deactivated });
  } catch (error) {
    console.error('Error deactivating key person:', error);
    return NextResponse.json(
      { error: '連絡先の無効化に失敗しました' },
      { status: 500 }
    );
  }
}
