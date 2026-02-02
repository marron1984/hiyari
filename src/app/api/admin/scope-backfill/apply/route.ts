/**
 * Scope Backfill Apply API
 *
 * POST /api/admin/scope-backfill/apply
 * Implementation Ticket 032: businessUnitId 未分類データの一括付与（適用）
 */

import { NextRequest, NextResponse } from 'next/server';
import { apply } from '@/lib/admin/backfill/repo';
import { canAccessBackfill } from '@/lib/admin/backfill/types';
import type { BackfillEntityType, BackfillFilters, AdminViewerContext } from '@/lib/admin/backfill/types';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_ADMIN = {
  userId: 'user_admin',
  userName: '管理者',
  role: 'admin' as const,
};

export async function POST(request: NextRequest) {
  try {
    // 権限チェック
    if (!canAccessBackfill(DEMO_ADMIN.role)) {
      return NextResponse.json(
        { success: false, error: 'この操作にはadmin権限が必要です' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // リクエストバリデーション
    const { entityType, filters, targetBusinessUnitId } = body;

    if (!entityType || !['tickets', 'repairs', 'correctiveActions', 'complaints'].includes(entityType)) {
      return NextResponse.json(
        { success: false, error: '有効なentityTypeを指定してください' },
        { status: 400 }
      );
    }

    if (!targetBusinessUnitId) {
      return NextResponse.json(
        { success: false, error: 'targetBusinessUnitIdは必須です' },
        { status: 400 }
      );
    }

    // フィルタの安全化（onlyUnclassified を強制）
    const safeFilters: BackfillFilters = {
      ...filters,
      onlyUnclassified: true,
    };

    const viewer: AdminViewerContext = {
      userId: DEMO_ADMIN.userId,
      userName: DEMO_ADMIN.userName,
      role: 'admin',
    };

    const result = apply(
      viewer,
      entityType as BackfillEntityType,
      safeFilters,
      targetBusinessUnitId
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      ...result.data,
    });
  } catch (error) {
    console.error('scope-backfill apply error:', error);
    return NextResponse.json(
      { success: false, error: '適用に失敗しました' },
      { status: 500 }
    );
  }
}
