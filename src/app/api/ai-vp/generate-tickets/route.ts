/**
 * API: AI副社長 チケット自動生成
 *
 * Task 043: AI VP Business Top3 → Ticket Auto-generation
 *
 * POST: チケット生成を実行
 *   - dryRun: true でシミュレーション（実際には作成しない）
 *   - includeAlerts: true で全社アラートも含める
 *   - maxTicketsPerRun: 1回の実行で作成する最大数
 *
 * GET: 今週生成されたチケット一覧を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { ViewerContext } from '@/lib/business/types';
import {
  generateTicketsFromTop3,
  getGeneratedTicketsThisWeek,
  formatGenerationReport,
  type GenerationOptions,
  type GenerationResult,
} from '@/lib/aiVp/ticketGenerator';
import { createNotification } from '@/lib/notifications/repo';

// ========== POST: チケット生成 ==========

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const body = await request.json();
    const {
      dryRun = false,
      includeAlerts = true,
      maxTicketsPerRun = 10,
      weekId,
    } = body;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    // 権限チェック（admin/executive/managerのみ実行可能）
    if (!['admin', 'executive', 'manager'].includes(viewer.role)) {
      return NextResponse.json(
        { error: 'この操作を実行する権限がありません' },
        { status: 403 }
      );
    }

    const options: GenerationOptions = {
      dryRun,
      includeAlerts,
      maxTicketsPerRun,
      weekId,
    };

    // チケット生成実行
    const result = await generateTicketsFromTop3(viewer, options);

    // dryRunでない場合、担当者への通知を作成
    if (!dryRun) {
      await createNotificationsForGeneratedTickets(result, user.uid);
    }

    // レポート生成
    const report = formatGenerationReport(result);

    return NextResponse.json({
      success: true,
      result: {
        weekId: result.weekId,
        generatedAt: result.generatedAt,
        totalProcessed: result.totalProcessed,
        created: result.created.length,
        skipped: result.skipped.length,
        createdTickets: result.created.map((item) => ({
          ticketId: item.ticket.id,
          title: item.ticket.title,
          priority: item.ticket.priority,
          category: item.ticket.category,
          businessUnitId: item.action.businessUnitId,
          businessUnitName: item.action.businessUnitName,
          fingerprint: item.action.fingerprint,
          dueAt: item.ticket.dueAt,
        })),
        skippedActions: result.skipped.map((item) => ({
          title: item.action.title,
          existingTicketId: item.ticket.id,
          fingerprint: item.action.fingerprint,
        })),
      },
      report,
      dryRun,
    });
  } catch (error) {
    console.error('[AI-VP Generate Tickets] Error:', error);
    return NextResponse.json(
      { error: 'チケット生成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ========== GET: 今週生成されたチケット一覧 ==========

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as ViewerContext['role'],
    };

    // 今週生成されたチケットを取得
    const tickets = getGeneratedTicketsThisWeek(viewer);

    return NextResponse.json({
      success: true,
      tickets: tickets.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        category: t.category,
        businessUnitId: t.businessUnitId,
        assigneeUserId: t.assigneeUserId,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
        relatedId: t.relatedId, // fingerprint
      })),
      count: tickets.length,
    });
  } catch (error) {
    console.error('[AI-VP Get Generated Tickets] Error:', error);
    return NextResponse.json(
      { error: '生成済みチケットの取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ========== 通知作成 ==========

async function createNotificationsForGeneratedTickets(
  result: GenerationResult,
  requestUserId: string
): Promise<void> {
  for (const item of result.created) {
    // チケット作成の通知（実行者向け）
    createNotification({
      tenantId: 'default',
      userId: requestUserId,
      type: 'ai_vp_ticket_created',
      title: 'AI副社長がチケットを作成しました',
      message: `${item.ticket.title}\n事業: ${item.action.businessUnitName}\n優先度: ${item.ticket.priority}`,
      actionUrl: `/dashboard/tickets/${item.ticket.id}`,
      metadata: {
        targetRole: 'manager',
        ticketId: item.ticket.id,
        businessUnitId: item.action.businessUnitId,
        fingerprint: item.action.fingerprint,
      },
    });

    // 推奨担当ロールがある場合、そのロール向けにも通知
    if (item.action.suggestedAssigneeRole) {
      createNotification({
        tenantId: 'default',
        userId: `role_${item.action.suggestedAssigneeRole}`,
        type: 'ai_vp_ticket_created',
        title: '担当推奨のチケットがあります',
        message: `${item.ticket.title}\n事業: ${item.action.businessUnitName}`,
        actionUrl: `/dashboard/tickets/${item.ticket.id}`,
        metadata: {
          targetRole: item.action.suggestedAssigneeRole,
          ticketId: item.ticket.id,
          businessUnitId: item.action.businessUnitId,
          fingerprint: item.action.fingerprint,
        },
      });
    }
  }
}
