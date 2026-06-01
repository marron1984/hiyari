/**
 * 資格管理API
 *
 * GET /api/licenses
 * GET /api/licenses?orgUnitId=xxx  (Task 030)
 * GET /api/licenses?expiringWithinDays=30
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { listLicenses, listLicenseTypes } from '@/lib/licenses/repo';
import type { LicenseListFilters, ViewerContext, LicenseCategoryType, UserLicenseStatus } from '@/lib/licenses/types';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Viewer context
    const viewer: ViewerContext = {
      userId: currentUser.id,
      role: currentUser.role,
      orgUnitIds: [],
    };

    // フィルタ構築
    const filters: LicenseListFilters = {};

    // Task 030: orgUnitId フィルタ（manager以上のみ有効）
    const orgUnitIdParam = searchParams.get('orgUnitId');
    if (orgUnitIdParam) {
      // manager以上のみ orgUnitIds を指定可
      if (['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
        filters.orgUnitIds = [orgUnitIdParam];
      }
    }

    // ステータスフィルタ
    const statusParam = searchParams.get('status');
    if (statusParam) {
      filters.status = [statusParam as UserLicenseStatus];
    }

    // カテゴリフィルタ
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      filters.category = categoryParam as LicenseCategoryType;
    }

    // 期限切れ間近フィルタ
    const expiringWithinDaysParam = searchParams.get('expiringWithinDays');
    if (expiringWithinDaysParam) {
      filters.expiringWithinDays = parseInt(expiringWithinDaysParam, 10);
    }

    // 期限切れフィルタ
    const expiredParam = searchParams.get('expired');
    if (expiredParam === 'true') {
      filters.expired = true;
    }

    // 検索
    const q = searchParams.get('q');
    if (q) {
      filters.q = q;
    }

    // ページネーション
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = listLicenses(viewer, filters, { limit, offset });

    return NextResponse.json({
      items: result.items,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('licenses GET error:', error);
    return NextResponse.json(
      { error: '資格一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
// 資格の新規作成は別途実装（管理者機能）
  return NextResponse.json(
    { error: '未実装' },
    { status: 501 }
  );
}
