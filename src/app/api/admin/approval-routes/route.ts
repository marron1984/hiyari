// /api/admin/approval-routes - 承認経路一覧・作成API
// キャッシュ禁止、admin権限必須

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import {
  getApprovalRoutes,
  createApprovalRoute,
} from '@/lib/approval-routes';
import { RingiApprovalRouteFormData } from '@/types';

const DEFAULT_TENANT_ID = 'defaultTenant';

// キャッシュを完全に無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 認証・権限チェック共通処理
 */
async function checkAuth(request: NextRequest): Promise<{
  ok: boolean;
  userId?: string;
  userName?: string;
  tenantId?: string;
  error?: NextResponse;
}> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      error: NextResponse.json({ error: '認証が必要です' }, { status: 401 }),
    };
  }

  const idToken = authHeader.substring(7);
  const decodedToken = await verifyIdToken(idToken);
  if (!decodedToken) {
    return {
      ok: false,
      error: NextResponse.json({ error: '無効なトークンです' }, { status: 401 }),
    };
  }

  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();
  const userRole = userData?.role || 'user';

  if (!hasMinRole(userRole, 'admin')) {
    return {
      ok: false,
      error: NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: decodedToken.uid,
    userName: userData?.name || 'Unknown',
    tenantId: userData?.tenantId || DEFAULT_TENANT_ID,
  };
}

/**
 * GET: 承認経路一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuth(request);
    if (!auth.ok) return auth.error;

    const routes = await getApprovalRoutes(auth.tenantId);

    return NextResponse.json(
      {
        success: true,
        routes,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Approval routes GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST: 承認経路を作成
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuth(request);
    if (!auth.ok) return auth.error;

    const body = await request.json();
    const formData = body as RingiApprovalRouteFormData;

    const route = await createApprovalRoute(
      formData,
      auth.userId!,
      auth.userName!,
      auth.tenantId
    );

    return NextResponse.json(
      {
        success: true,
        route,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Approval routes POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: error instanceof Error && error.message.includes('必須') ? 400 : 500 }
    );
  }
}
