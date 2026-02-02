/**
 * 全通知既読API
 *
 * POST /api/notifications/read-all - 全通知を既読にする
 * Implementation Ticket 036: Notifications 永続化（DB化）
 */

import { NextRequest, NextResponse } from 'next/server';
import { markAllReadByRole } from '@/lib/notifications/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_manager',
  name: '田中管理者',
  role: 'manager' as AppRole,
};

export async function POST(_request: NextRequest) {
  try {
    // ロール別の全通知を既読にする
    const { count } = markAllReadByRole(DEMO_USER.role);

    return NextResponse.json({
      success: true,
      count,
      message: count > 0 ? `${count}件の通知を既読にしました` : '既読にする通知はありませんでした',
    });
  } catch (error) {
    console.error('notifications read-all POST error:', error);
    return NextResponse.json(
      { error: '既読処理に失敗しました' },
      { status: 500 }
    );
  }
}
