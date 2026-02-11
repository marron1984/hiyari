/**
 * 既読レシートAPI
 *
 * POST /api/read-receipts - 既読をマーク
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { markRead } from '@/lib/readTracking/repo';
import type { EntityType } from '@/lib/readTracking/types';

const VALID_ENTITY_TYPES: EntityType[] = ['announcement', 'document', 'training'];

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  // ボディ解析
  let body: { entityType: string; entityId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが不正です' },
      { status: 400 }
    );
  }

  const { entityType, entityId } = body;

  // バリデーション
  if (!entityType || !VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
    return NextResponse.json(
      { error: '無効なエンティティタイプです' },
      { status: 400 }
    );
  }

  if (!entityId) {
    return NextResponse.json(
      { error: 'エンティティIDが必要です' },
      { status: 400 }
    );
  }

  // 既読をマーク
  const receipt = markRead(user.uid, entityType as EntityType, entityId);

  return NextResponse.json({
    success: true,
    receipt,
  });
}
