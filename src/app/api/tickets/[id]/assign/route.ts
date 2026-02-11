/**
 * チケット担当割当API
 *
 * POST /api/tickets/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { assignTicket } from '@/lib/tickets/repo';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;
    const body = await request.json();
    const { assigneeUserId } = body;

    if (!assigneeUserId) {
      return NextResponse.json(
        { error: '担当者IDは必須です' },
        { status: 400 }
      );
    }

    const viewer = { userId: user.uid, role: user.role as AppRole };
    const result = assignTicket(id, assigneeUserId, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    // 割当通知を送信（失敗しても本体処理には影響させない）
    try {
      const today = new Date().toISOString().split('T')[0];
      await createNotificationAsync({
        tenantId: 'default',
        userId: assigneeUserId,
        type: 'system',
        severity: 'info',
        title: 'チケットが担当割当されました',
        message: `チケット「${result.ticket.title}」が担当割当されました`,
        url: `/dashboard/tickets/${id}`,
        fingerprint: `ticket_assign:${id}:${today}:${assigneeUserId}`,
      });
    } catch (error) {
      console.error('Failed to send ticket assign notification:', error);
    }

    return NextResponse.json({ ticket: result.ticket });
  } catch (error) {
    console.error('ticket assign POST error:', error);
    return NextResponse.json(
      { error: '担当割当に失敗しました' },
      { status: 500 }
    );
  }
}
