/**
 * ユーザーロール変更API
 *
 * POST /api/admin/roles/users/[userId]/role
 * ボディ: { newRole, note? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { changeUserRole, getUserById } from '@/lib/roles/user-store.firestore';
import { requireAdmin } from '@/lib/auth/requireRole';
import type { AppRole } from '@/config/appRoles';

const VALID_ROLES: AppRole[] = ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  // 管理者権限チェック
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: 'アクセス権限がありません' },
      { status: 403 }
    );
  }

  const { userId } = await params;

  // ユーザー存在確認
  const targetUser = await getUserById(userId);
  if (!targetUser) {
    return NextResponse.json(
      { error: 'ユーザーが見つかりません' },
      { status: 404 }
    );
  }

  // ボディ解析
  let body: { newRole: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが不正です' },
      { status: 400 }
    );
  }

  const { newRole, note } = body;

  // ロール検証
  if (!newRole || !VALID_ROLES.includes(newRole as AppRole)) {
    return NextResponse.json(
      { error: '無効なロールが指定されました' },
      { status: 400 }
    );
  }

  // 同じロールへの変更は不可
  if (targetUser.role === newRole) {
    return NextResponse.json(
      { error: '同じロールへの変更はできません' },
      { status: 400 }
    );
  }

  // 暫定：actorは固定（本番では認証から取得）
  const actorUserId = 'demo_admin';
  const actorUserName = 'システム管理者';

  // ロール変更実行
  const result = await changeUserRole(
    {
      userId,
      newRole: newRole as AppRole,
      note,
    },
    actorUserId,
    actorUserName
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'ロール変更に失敗しました' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    user: result.user,
    message: `${targetUser.name}のロールを${targetUser.role}から${newRole}に変更しました`,
  });
}
