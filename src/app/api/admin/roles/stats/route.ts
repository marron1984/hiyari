/**
 * ロール統計API
 *
 * GET /api/admin/roles/stats
 */

import { NextResponse } from 'next/server';
import { getUserRoleStats } from '@/lib/roles/user-store.firestore';
import { requireAdmin } from '@/lib/auth/requireRole';

export async function GET() {
  // 管理者権限チェック
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: 'アクセス権限がありません' },
      { status: 403 }
    );
  }

  const stats = await getUserRoleStats();

  return NextResponse.json(stats);
}
