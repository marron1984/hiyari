/**
 * Scope Backfill Preview API
 *
 * POST /api/admin/scope-backfill/preview
 * Implementation Ticket 032: businessUnitId 未分類データの一括付与（プレビュー）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { preview } from '@/lib/admin/backfill/repo';
import { canAccessBackfill } from '@/lib/admin/backfill/types';
import type { BackfillEntityType, BackfillFilters, AdminViewerContext } from '@/lib/admin/backfill/types';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // 権限チェック
    if (!canAccessBackfill(user.role)) {
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
      limit: Math.min(filters?.limit ?? 200, 500),  // 最大500件
    };

    const viewer: AdminViewerContext = {
      userId: user.uid,
      userName: user.name,
      role: 'admin',
    };

    const result = preview(
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
    console.error('scope-backfill preview error:', error);
    return NextResponse.json(
      { success: false, error: 'プレビューに失敗しました' },
      { status: 500 }
    );
  }
}
