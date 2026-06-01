/**
 * キーパーソン無効化 API
 *
 * POST /api/key-person/[id]/deactivate
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getById, deactivateContact } from '@/lib/keyPerson/repo';
import { canEditKeyPerson } from '@/lib/keyPerson/types';
import type { ViewerContext } from '@/lib/keyPerson/types';

// デモユーザー
const currentUser: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const contact = getById(id, currentUser);

    if (!contact) {
      return NextResponse.json(
        { error: '連絡先が見つかりません' },
        { status: 404 }
      );
    }

    const deactivated = deactivateContact(id, currentUser.id);

    return NextResponse.json({ contact: deactivated });
  } catch (error) {
    console.error('Error deactivating key person:', error);
    return NextResponse.json(
      { error: '連絡先の無効化に失敗しました' },
      { status: 500 }
    );
  }
}
