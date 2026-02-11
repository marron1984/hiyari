/**
 * 空室問い合わせ 申込記録API
 *
 * Ticket 084: 申込（applied）簡易入力
 *
 * POST /api/vacancy-inquiries/[ticketId]/apply
 * body: { desiredMoveInDate?, requiredDocsStatus?, applicationNote?, applicationChannel? }
 *
 * 処理:
 * - meta.appliedAt = now
 * - meta の各項目を保存
 * - stage を applied に更新
 *
 * RBAC: チケット更新権限が必要
 */

import { NextRequest, NextResponse } from 'next/server';
import { markAsApplied } from '@/lib/tickets/repo';
import type { ViewerContext, ApplicationChannel } from '@/lib/tickets/types';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

// 有効な申込チャネル
const VALID_CHANNELS: ApplicationChannel[] = ['in_person', 'online', 'other'];

interface RouteParams {
  params: Promise<{ ticketId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { ticketId } = await params;

    const body = await request.json();
    const {
      desiredMoveInDate,
      requiredDocsStatus,
      applicationNote,
      applicationChannel,
    } = body;

    // 申込チャネルのバリデーション
    if (applicationChannel && !VALID_CHANNELS.includes(applicationChannel)) {
      return NextResponse.json(
        { error: `無効な申込チャネルです: ${applicationChannel}` },
        { status: 400 }
      );
    }

    // 希望入居日のフォーマットチェック（YYYY-MM-DD）
    if (desiredMoveInDate && !/^\d{4}-\d{2}-\d{2}$/.test(desiredMoveInDate)) {
      return NextResponse.json(
        { error: '希望入居日は YYYY-MM-DD 形式で指定してください' },
        { status: 400 }
      );
    }

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as AppRole,
    };

    const result = markAsApplied(
      ticketId,
      {
        desiredMoveInDate,
        requiredDocsStatus,
        applicationNote,
        applicationChannel,
      },
      viewer
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ticket: result.ticket,
    });
  } catch (error) {
    console.error('vacancy-inquiries/[ticketId]/apply POST error:', error);
    return NextResponse.json(
      { error: '申込記録に失敗しました' },
      { status: 500 }
    );
  }
}
