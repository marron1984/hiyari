/**
 * 全通知既読API
 *
 * POST /api/notifications/read-all - 全通知を既読にする
 * Implementation Ticket 036: Notifications 永続化（DB化）
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { markAllReadByRole } from '@/lib/notifications/repo';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // ロール別の全通知を既読にする
    const { count } = markAllReadByRole(currentUser.role);

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
