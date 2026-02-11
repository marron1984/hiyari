/**
 * アラート解決API
 *
 * POST /api/alerts/{id}/resolve
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateAlertStatusAsync, getAlertByIdAsync } from '@/lib/alerts/repo.firestore';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // アラート存在確認
  const existing = await getAlertByIdAsync(id);
  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'アラートが見つかりません' },
      { status: 404 }
    );
  }

  // すでに解決済みの場合
  if (existing.status === 'resolved') {
    return NextResponse.json(
      { success: false, error: 'このアラートはすでに解決済みです' },
      { status: 400 }
    );
  }

  // ステータス更新
  const alert = await updateAlertStatusAsync(id, 'resolved', null);

  return NextResponse.json({
    success: true,
    alert,
    message: 'アラートを解決済みにしました',
  });
}
