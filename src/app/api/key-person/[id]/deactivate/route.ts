/**
 * キーパーソン無効化 API
 *
 * POST /api/key-person/[id]/deactivate
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, deactivateContact } from '@/lib/keyPerson/repo';
import { canEditKeyPerson } from '@/lib/keyPerson/types';
import type { ViewerContext } from '@/lib/keyPerson/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 権限チェック
    if (!canEditKeyPerson(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '編集権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contact = getById(id, DEMO_VIEWER);

    if (!contact) {
      return NextResponse.json(
        { error: '連絡先が見つかりません' },
        { status: 404 }
      );
    }

    const deactivated = deactivateContact(id, DEMO_VIEWER.userId);

    return NextResponse.json({ contact: deactivated });
  } catch (error) {
    console.error('Error deactivating key person:', error);
    return NextResponse.json(
      { error: '連絡先の無効化に失敗しました' },
      { status: 500 }
    );
  }
}
