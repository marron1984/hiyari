// /api/admin/approval-routes/seed - 承認経路初期テンプレ作成API
// 0件の場合のみ実行、二重作成防止

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import { seedApprovalRouteTemplates } from '@/lib/approval-routes';

const DEFAULT_TENANT_ID = 'defaultTenant';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST: 初期承認経路テンプレを作成
 * - approval_routes が 0件のときのみ実行
 * - 二重作成防止
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // ユーザー情報取得
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    // admin権限チェック
    if (!hasMinRole(userRole, 'admin')) {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      );
    }

    const tenantId = userData?.tenantId || DEFAULT_TENANT_ID;

    // 初期テンプレを作成
    const result = await seedApprovalRouteTemplates(
      tenantId,
      decodedToken.uid,
      userData?.name || 'Unknown'
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Seed approval routes API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
