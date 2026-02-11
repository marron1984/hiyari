/**
 * キーパーソン登録済み対象一覧 API
 *
 * GET /api/key-person/subjects
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSubjectsWithContacts } from '@/lib/keyPerson/repo.firestore';
import { canViewKeyPerson } from '@/lib/keyPerson/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // 権限チェック
    if (!canViewKeyPerson(user.role as AppRole)) {
      return NextResponse.json(
        { error: '閲覧権限がありません' },
        { status: 403 }
      );
    }

    const subjects = await getSubjectsWithContacts();

    return NextResponse.json({ subjects });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    return NextResponse.json(
      { error: '対象一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
