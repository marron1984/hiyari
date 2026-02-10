/**
 * メールアドレス指定でモジュール権限を付与するAPI
 *
 * POST /api/admin/module-permissions
 * ボディ: { email: string, modulePermissions: ModulePermissions }
 *
 * 管理者のみ実行可能
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import type { ModulePermissions } from '@/types';

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

    // 管理者権限チェック
    const adminDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const adminData = adminDoc.data();
    const adminRole = adminData?.role || 'user';

    if (!hasMinRole(adminRole, 'admin')) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // ボディ解析
    const body = await request.json();
    const { email, modulePermissions } = body as {
      email: string;
      modulePermissions: ModulePermissions;
    };

    if (!email) {
      return NextResponse.json({ error: 'emailが必要です' }, { status: 400 });
    }

    if (!modulePermissions || typeof modulePermissions !== 'object') {
      return NextResponse.json(
        { error: 'modulePermissionsが必要です' },
        { status: 400 }
      );
    }

    // メールアドレスでユーザーを検索
    const usersSnapshot = await getAdminDb()
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return NextResponse.json(
        { error: `ユーザー ${email} が見つかりません` },
        { status: 404 }
      );
    }

    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();

    // Firestoreに保存
    await getAdminDb().collection('users').doc(userDoc.id).update({
      modulePermissions,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `${userData.name || email}のモジュール権限を更新しました`,
      userId: userDoc.id,
      email,
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
