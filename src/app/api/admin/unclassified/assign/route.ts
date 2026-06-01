/**
 * 未分類一括付与API
 *
 * POST /api/admin/unclassified/assign
 * Implementation Ticket 034: 未分類を現場で即解消できるUI + 一括付与
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { assignBusinessUnit } from '@/lib/admin/unclassified/repo';
import { canAccessUnclassified } from '@/lib/admin/unclassified/types';
import type { BackfillEntityType } from '@/lib/admin/backfill/types';

export async function POST(request: NextRequest) {
  
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
// 権限チェック
  if (!canAccessUnclassified(currentUser.role)) {
    return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
  }

  try {
    const body = await request.json();

    const { entityType, ids, targetBusinessUnitId } = body;

    // バリデーション
    if (!entityType || !['tickets', 'repairs', 'correctiveActions'].includes(entityType)) {
      return NextResponse.json(
        { error: '有効なエンティティタイプを指定してください（tickets/repairs/correctiveActions）' },
        { status: 400 }
      );
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: '対象IDを1件以上指定してください' },
        { status: 400 }
      );
    }

    if (!targetBusinessUnitId) {
      return NextResponse.json(
        { error: '付与先の事業単位IDを指定してください' },
        { status: 400 }
      );
    }

    // 一括付与実行
    const result = assignBusinessUnit(
      { userId: currentUser.id, userName: currentUser.name, role: 'admin' },
      {
        entityType: entityType as BackfillEntityType,
        ids,
        targetBusinessUnitId,
      }
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      ...result.data,
      message: `${result.data.affectedCount}件に事業単位を付与しました（${result.data.skippedCount}件スキップ）`,
    });
  } catch (error) {
    console.error('unclassified assign POST error:', error);
    return NextResponse.json(
      { error: '一括付与に失敗しました' },
      { status: 500 }
    );
  }
}
