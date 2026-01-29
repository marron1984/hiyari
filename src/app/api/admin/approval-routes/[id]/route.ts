// /api/admin/approval-routes/[id] - 承認経路個別操作API
// キャッシュ禁止、admin権限必須

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import {
  getApprovalRoute,
  updateApprovalRoute,
  deleteApprovalRoute,
  setDefaultApprovalRoute,
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

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET: 承認経路を1件取得
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await checkAuth(request);
    if (!auth.ok) return auth.error;

    const { id } = await context.params;
    const route = await getApprovalRoute(id);

    if (!route) {
      return NextResponse.json(
        { success: false, error: '承認経路が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, route },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Approval route GET error:', error);
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
 * PUT: 承認経路を更新
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await checkAuth(request);
    if (!auth.ok) return auth.error;

    const { id } = await context.params;
    const body = await request.json();

    // デフォルト設定の特別処理
    if (body.setDefault === true) {
      await setDefaultApprovalRoute(id, auth.tenantId);
      const route = await getApprovalRoute(id);
      return NextResponse.json({ success: true, route });
    }

    const formData = body as RingiApprovalRouteFormData;
    const route = await updateApprovalRoute(id, formData, auth.userId!);

    return NextResponse.json({ success: true, route });
  } catch (error) {
    console.error('Approval route PUT error:', error);
    const status = error instanceof Error && error.message.includes('見つかりません')
      ? 404
      : error instanceof Error && error.message.includes('必須')
        ? 400
        : 500;
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status }
    );
  }
}

/**
 * DELETE: 承認経路を削除
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await checkAuth(request);
    if (!auth.ok) return auth.error;

    const { id } = await context.params;
    await deleteApprovalRoute(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Approval route DELETE error:', error);
    const status = error instanceof Error && error.message.includes('見つかりません')
      ? 404
      : 500;
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status }
    );
  }
}
