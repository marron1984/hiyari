/**
 * ユーザー一覧API（ロール管理用）
 *
 * GET /api/admin/roles/users
 * クエリ: role, branchId, search
 */

import { NextRequest, NextResponse } from 'next/server';
import { listUsers } from '@/lib/roles/user-store';
import { requireAdmin } from '@/lib/auth/requireRole';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  // 管理者権限チェック
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: 'アクセス権限がありません' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role') as AppRole | null;
  const search = searchParams.get('search');

  // フィルタオプションを渡してlistUsersを呼び出し
  const { users, total } = listUsers({
    role: role ?? undefined,
    search: search ?? undefined,
  });

  return NextResponse.json({
    users,
    total,
  });
}
