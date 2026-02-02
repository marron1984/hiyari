/**
 * 資格統計API
 *
 * GET /api/licenses/stats
 * GET /api/licenses/stats?orgUnitId=xxx  (Task 030)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStats } from '@/lib/licenses/repo';
import type { ViewerContext } from '@/lib/licenses/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
  orgUnitIds: ['org_higashi', 'org_nishi'],
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Viewer context
    const viewer: ViewerContext = {
      userId: DEMO_USER.id,
      role: DEMO_USER.role,
      orgUnitIds: DEMO_USER.orgUnitIds,
    };

    // Task 030: orgUnitId / orgUnitIds フィルタ
    let orgUnitIds: string[] | undefined;

    const orgUnitIdParam = searchParams.get('orgUnitId');
    const orgUnitIdsParam = searchParams.get('orgUnitIds');

    if (orgUnitIdParam) {
      orgUnitIds = [orgUnitIdParam];
    } else if (orgUnitIdsParam) {
      orgUnitIds = orgUnitIdsParam.split(',').filter(Boolean);
    }

    // manager以上のみ orgUnitIds フィルタが有効
    // staff/leader は自分の統計のみ（リポジトリ側で制御）
    const stats = getStats(viewer, orgUnitIds ? { orgUnitIds } : undefined);

    if (!stats) {
      return NextResponse.json(
        { error: '統計の閲覧権限がありません' },
        { status: 403 }
      );
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('licenses stats GET error:', error);
    return NextResponse.json(
      { error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
