/**
 * キーパーソン並び替え API
 *
 * POST /api/key-person/reorder
 */

import { NextRequest, NextResponse } from 'next/server';
import { reorderContacts } from '@/lib/keyPerson/repo';
import { canEditKeyPerson } from '@/lib/keyPerson/types';
import type { KeyPersonSubjectType } from '@/lib/keyPerson/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function POST(request: NextRequest) {
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

    const body = await request.json();

    const { subjectType, subjectId, orderedIds } = body as {
      subjectType: KeyPersonSubjectType;
      subjectId: string;
      orderedIds: string[];
    };

    if (!subjectType || !subjectId || !orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: 'subjectType, subjectId, orderedIds は必須です' },
        { status: 400 }
      );
    }

    const contacts = reorderContacts(
      subjectType,
      subjectId,
      orderedIds,
      user.uid
    );

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error('Error reordering key persons:', error);
    return NextResponse.json(
      { error: '並び替えに失敗しました' },
      { status: 500 }
    );
  }
}
