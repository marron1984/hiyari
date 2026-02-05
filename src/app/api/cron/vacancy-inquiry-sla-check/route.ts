/**
 * 空室問い合わせSLAチェック（Cron）
 *
 * Ticket 071: 空室問い合わせ CRM化
 *
 * POST /api/cron/vacancy-inquiry-sla-check
 *
 * - SLA超過チケットを検出
 * - manager と assignee に通知
 * - fingerprint は ticketId + 日付で冪等
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSlaBreachedTickets, getTicketByIdInternal } from '@/lib/tickets/repo';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';
import { VACANCY_INQUIRY_SLA_HOURS } from '@/lib/tickets/types';

// マネージャーのユーザーID（デモ用、本番では設定から取得）
const MANAGER_USER_IDS = ['user_003'];

export async function POST(request: NextRequest) {
  try {
    const breachedTickets = getSlaBreachedTickets();

    if (breachedTickets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'SLA超過チケットはありません',
        processed: 0,
      });
    }

    const today = new Date().toISOString().split('T')[0];
    let notificationsSent = 0;

    for (const ticket of breachedTickets) {
      // 超過時間計算
      const hoursOverdue = ticket.slaDueAt
        ? Math.floor((Date.now() - new Date(ticket.slaDueAt).getTime()) / (1000 * 60 * 60))
        : 0;

      // 通知先リスト（assignee + managers）
      const notifyUserIds = new Set<string>();

      // assigneeへ通知
      if (ticket.assigneeUserId) {
        notifyUserIds.add(ticket.assigneeUserId);
      }

      // managersへ通知
      for (const managerId of MANAGER_USER_IDS) {
        notifyUserIds.add(managerId);
      }

      // 各ユーザーに通知
      for (const userId of notifyUserIds) {
        // fingerprint: ticketId + 日付 + userId で冪等
        const fingerprint = `vacancy_inquiry_sla:${ticket.id}:${today}:${userId}`;

        try {
          await createNotificationAsync({
            tenantId: 'default',
            userId,
            type: 'vacancy_inquiry_sla_breach',
            title: '空室問い合わせ初動SLA超過',
            message: `「${ticket.title}」の初動期限（${VACANCY_INQUIRY_SLA_HOURS}時間）を${hoursOverdue}時間超過しています`,
            severity: hoursOverdue >= 8 ? 'critical' : 'warning',
            url: `/dashboard/tickets/${ticket.id}`,
            fingerprint,
          });
          notificationsSent++;
        } catch (notifyError) {
          // 重複の場合はスキップ
          console.log(`Notification skipped (duplicate): ${fingerprint}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      breachedCount: breachedTickets.length,
      notificationsSent,
      tickets: breachedTickets.map((t) => ({
        id: t.id,
        title: t.title,
        slaDueAt: t.slaDueAt,
        assigneeUserId: t.assigneeUserId,
      })),
    });
  } catch (error) {
    console.error('vacancy-inquiry-sla-check error:', error);
    return NextResponse.json(
      { error: 'SLAチェックに失敗しました' },
      { status: 500 }
    );
  }
}

// GETも許可（デバッグ用）
export async function GET(request: NextRequest) {
  return POST(request);
}
