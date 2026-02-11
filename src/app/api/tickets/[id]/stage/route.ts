/**
 * チケットステージ更新API
 *
 * Ticket 071: 空室問い合わせ CRM化
 * Ticket 075: 空室更新提案の自動生成（accepted時）
 * Ticket 091: キャンセル/不成立で空室を戻す（increase_available 提案の自動生成）
 *
 * POST /api/tickets/[id]/stage - ステージ変更
 *
 * RBAC: チケット更新権限が必要
 */

import { NextRequest, NextResponse } from 'next/server';
import { changeTicketStage, getTicketById } from '@/lib/tickets/repo';
import type { VacancyInquiryStage, ViewerContext } from '@/lib/tickets/types';
import type { AppRole } from '@/config/appRoles';
import {
  createSuggestionForAcceptedInquiry,
  createSuggestionForCanceledInquiry,
  handleRejectedInquiry,
} from '@/lib/vacancySuggestions/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

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
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

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
      userId: user.uid,
      role: user.role as AppRole,
    };

    const result = changeTicketStage(id, stage, viewer);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // Ticket 075: 空室更新提案の自動生成
    // Ticket 091: キャンセル/不成立で空室復帰提案の自動生成
    const ticket = result.ticket;
    if (ticket.relatedType === 'vacancy_inquiry') {
      if (stage === 'accepted') {
        // accepted になったら空室減少提案を生成
        const vacancyUnitId = ticket.metaJson?.vacancyUnitId;
        if (vacancyUnitId && ticket.businessUnitId) {
          createSuggestionForAcceptedInquiry(
            id,
            ticket.businessUnitId,
            vacancyUnitId
          ).catch((error) => {
            console.error('[Stage API] Failed to create vacancy suggestion:', error);
          });
        }
      } else if (stage === 'rejected' || stage === 'closed') {
        // rejected/closed の場合は既存の open 提案を通知
        handleRejectedInquiry(id);

        // Ticket 091: reservedVacancyUnitId がある場合は空室復帰提案を生成
        const reservedVacancyUnitId = ticket.metaJson?.reservedVacancyUnitId;
        if (reservedVacancyUnitId && ticket.businessUnitId) {
          createSuggestionForCanceledInquiry(
            id,
            ticket.businessUnitId,
            reservedVacancyUnitId,
            stage as 'rejected' | 'closed'
          ).catch((error) => {
            console.error('[Stage API] Failed to create increase suggestion:', error);
          });
        }
      }
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
