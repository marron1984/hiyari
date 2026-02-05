/**
 * チケットステージ更新API
 *
 * Ticket 071: 空室問い合わせ CRM化
 *
 * POST /api/tickets/[id]/stage - ステージ変更
 *
 * RBAC: チケット更新権限が必要
 */

import { NextRequest, NextResponse } from 'next/server';
import { changeTicketStage } from '@/lib/tickets/repo';
import type { VacancyInquiryStage, ViewerContext } from '@/lib/tickets/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

// 有効なステージ値
const VALID_STAGES: VacancyInquiryStage[] = [
  'new',
  'contacted',
  'tour_scheduled',
  'applied',
  'accepted',
  'rejected',
  'closed',
];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const body = await request.json();
    const { stage } = body;

    // バリデーション
    if (!stage) {
      return NextResponse.json(
        { error: 'ステージを指定してください' },
        { status: 400 }
      );
    }

    if (!VALID_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: `無効なステージです: ${stage}` },
        { status: 400 }
      );
    }

    const viewer: ViewerContext = {
      userId: DEMO_USER.id,
      role: DEMO_USER.role,
    };

    const result = changeTicketStage(id, stage, viewer);

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
    console.error('tickets/[id]/stage POST error:', error);
    return NextResponse.json(
      { error: 'ステージの更新に失敗しました' },
      { status: 500 }
    );
  }
}
