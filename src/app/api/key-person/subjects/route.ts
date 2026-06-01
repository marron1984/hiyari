/**
 * キーパーソン登録済み対象一覧 API
 *
 * GET /api/key-person/subjects
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getSubjectsWithContacts } from '@/lib/keyPerson/repo';
import { canViewKeyPerson } from '@/lib/keyPerson/types';
import type { ViewerContext } from '@/lib/keyPerson/types';

// デモユーザー
const currentUser: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 権限チェック
    if (!canViewKeyPerson(currentUser.role)) {
      return NextResponse.json(
        { error: '閲覧権限がありません' },
        { status: 403 }
      );
    }

    const subjects = getSubjectsWithContacts();

    return NextResponse.json({ subjects });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    return NextResponse.json(
      { error: '対象一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
