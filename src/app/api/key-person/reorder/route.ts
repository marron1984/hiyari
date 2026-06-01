/**
 * キーパーソン並び替え API
 *
 * POST /api/key-person/reorder
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { reorderContacts } from '@/lib/keyPerson/repo';
import { canEditKeyPerson } from '@/lib/keyPerson/types';
import type { KeyPersonSubjectType, ViewerContext } from '@/lib/keyPerson/types';

// デモユーザー
const currentUser: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェック
    if (!canEditKeyPerson(currentUser.role)) {
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
      currentUser.id
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
