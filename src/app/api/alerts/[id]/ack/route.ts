/**
 * アラート確認（ACK）API
 *
 * POST /api/alerts/{id}/ack
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateAlertStatus, getAlertById } from '@/lib/alerts/repo';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // アラート存在確認
  const existing = getAlertById(id);
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
  const alert = updateAlertStatus(id, 'acknowledged', null);

  return NextResponse.json({
    success: true,
    alert,
    message: 'アラートを確認済みにしました',
  });
}
