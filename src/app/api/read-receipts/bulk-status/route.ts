/**
 * 一括既読ステータスAPI
 *
 * POST /api/read-receipts/bulk-status
 * 複数エンティティの既読状態を一括取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listReadIds } from '@/lib/readTracking/repo';
import type { EntityType } from '@/lib/readTracking/types';

const VALID_ENTITY_TYPES: EntityType[] = ['announcement', 'document', 'training'];

export async function POST(request: NextRequest) {
  // 暫定：ユーザーIDはヘッダーから取得（本番では認証から）
  const userId = request.headers.get('x-user-id') ?? 'user_001';

  // ボディ解析
  let body: { entityType: string; entityIds: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが不正です' },
      { status: 400 }
    );
  }

  const { entityType, entityIds } = body;

  // バリデーション
  if (!entityType || !VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
    return NextResponse.json(
      { error: '無効なエンティティタイプです' },
      { status: 400 }
    );
  }

  if (!entityIds || !Array.isArray(entityIds)) {
    return NextResponse.json(
      { error: 'エンティティID配列が必要です' },
      { status: 400 }
    );
  }

  // 既読ID一覧を取得
  const readIdsSet = listReadIds(userId, entityType as EntityType, entityIds);
  const readEntityIds = Array.from(readIdsSet);

  return NextResponse.json({
    readEntityIds,
  });
}
