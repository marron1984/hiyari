/**
 * 空室問い合わせ 受入決定API
 *
 * Ticket 085: 受入決定（accepted）確定フロー + 空室更新提案（075連動）
 *
 * POST /api/vacancy-inquiries/[ticketId]/accept
 * body: { vacancyUnitId?, acceptedNote? }
 *
 * 処理:
 * - meta.acceptedAt = now
 * - meta.acceptedNote, reservedVacancyUnitId, acceptedByUserId を保存
 * - stage を accepted に更新
 * - vacancy_update_suggestions を自動生成（075連動）
 *
 * RBAC: assignee / manager のみ
 */

import { NextRequest, NextResponse } from 'next/server';
import { markAsAccepted } from '@/lib/tickets/repo';
import { createSuggestionForAcceptedInquiry } from '@/lib/vacancySuggestions/repo';
import type { ViewerContext } from '@/lib/tickets/types';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

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
    const { vacancyUnitId, acceptedNote } = body;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as AppRole,
    };

    const result = markAsAccepted(
      ticketId,
      {
        vacancyUnitId,
        acceptedNote,
      },
      viewer
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // vacancy_update_suggestions を作成（075連動）
    let suggestionCreated = false;
    if (result.businessUnitId && result.reservedVacancyUnitId) {
      try {
        const suggestion = await createSuggestionForAcceptedInquiry(
          ticketId,
          result.businessUnitId,
          result.reservedVacancyUnitId
        );
        if (suggestion) {
          suggestionCreated = true;
        }
      } catch (error) {
        console.error('[accept] Failed to create suggestion:', error);
        // 提案作成失敗してもチケット更新は成功扱い
      }
    }

    return NextResponse.json({
      ticket: result.ticket,
      suggestionCreated,
    });
  } catch (error) {
    console.error('vacancy-inquiries/[ticketId]/accept POST error:', error);
    return NextResponse.json(
      { error: '受入決定の記録に失敗しました' },
      { status: 500 }
    );
  }
}
