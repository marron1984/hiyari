/**
 * キーパーソン登録済み対象一覧 API
 *
 * GET /api/key-person/subjects
 */

import { NextResponse } from 'next/server';
import { getSubjectsWithContacts } from '@/lib/keyPerson/repo';
import { canViewKeyPerson } from '@/lib/keyPerson/types';
import type { ViewerContext } from '@/lib/keyPerson/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET() {
  try {
    // 権限チェック
    if (!canViewKeyPerson(DEMO_VIEWER.role)) {
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
