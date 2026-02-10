/**
 * モジュール権限設定API
 *
 * PUT /api/admin/roles/users/[userId]/module-permissions
 * ボディ: { modulePermissions: { prospects?: { canEdit?: boolean } } }
 *
 * 管理者のみ実行可能
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import type { ModulePermissions } from '@/types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: targetUserId } = await params;

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

    // 管理者権限チェック
    const adminDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const adminData = adminDoc.data();
    const adminRole = adminData?.role || 'user';

    if (!hasMinRole(adminRole, 'admin')) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // 対象ユーザーの存在確認
    const targetUserDoc = await getAdminDb().collection('users').doc(targetUserId).get();
    if (!targetUserDoc.exists) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    // ボディ解析
    const body = await request.json();
    const { modulePermissions } = body as { modulePermissions: ModulePermissions };

    if (!modulePermissions || typeof modulePermissions !== 'object') {
      return NextResponse.json(
        { error: 'modulePermissionsが必要です' },
        { status: 400 }
      );
    }

    // Firestoreに保存
    await getAdminDb().collection('users').doc(targetUserId).update({
      modulePermissions,
      updatedAt: new Date(),
    });

    const targetData = targetUserDoc.data();
    return NextResponse.json({
      success: true,
      message: `${targetData?.name || targetUserId}のモジュール権限を更新しました`,
      modulePermissions,
    });
  } catch (error) {
    console.error('Failed to update module permissions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
