/**
 * 是正措置API
 *
 * GET /api/corrective-actions       - 一覧取得
 * POST /api/corrective-actions      - 新規作成
 *
 * Task 030: businessUnitId フィルタ対応
 * Task 033: ガードレール検証
 * Task 035: staff 向け businessUnitId 自動推定（source継承対応）
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import {
  listCorrectiveActions,
  create,
} from '@/lib/correctiveActions/repo';
import type {
  CorrectiveActionStatus,
  CorrectiveActionSeverity,
  SourceType,
} from '@/lib/correctiveActions/types';
import type { AppRole } from '@/config/appRoles';
import { validateApiGuardrail } from '@/lib/scope/guardrail';
import { processStaffCreation, requiresInference } from '@/lib/scope/inferBusinessUnit';
import { getTicketById } from '@/lib/tickets/repo';
import { getRepairById } from '@/lib/repairs/repo';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Task 030: businessUnitId フィルタ
    const businessUnitIdParam = searchParams.get('businessUnitId');
    // 'null' 文字列は未分類を意味する
    const businessUnitId = businessUnitIdParam === 'null'
      ? null
      : (businessUnitIdParam ?? undefined);

    const status = searchParams.get('status') as CorrectiveActionStatus | null;
    const severity = searchParams.get('severity') as CorrectiveActionSeverity | null;
    const sourceType = searchParams.get('sourceType') as SourceType | null;
    const overdue = searchParams.get('overdue') === 'true';
    const q = searchParams.get('q');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined;

    const viewer = { userId: currentUser.id, role: currentUser.role };
    const result = listCorrectiveActions(viewer, {
      businessUnitId,
      status: status ?? undefined,
      severity: severity ?? undefined,
      sourceType: sourceType ?? undefined,
      overdue: overdue || undefined,
      q: q ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      items: result.items,
      total: result.total,
    });
  } catch (error) {
    console.error('corrective-actions GET error:', error);
    return NextResponse.json(
      { error: '是正措置の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();

    const {
      title,
      description,
      severity,
      sourceType,
      sourceId,
      businessUnitId,
      rootCause,
      actionPlan,
      ownerUserId,
      dueAt,
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'タイトルと説明は必須です' },
        { status: 400 }
      );
    }

    // Task 033: ガードレール検証（manager/leader は businessUnitId 必須）
    const guardrailResult = validateApiGuardrail(currentUser.role, 'correctiveActions', { businessUnitId });
    if (!guardrailResult.valid) {
      return NextResponse.json(
        { error: guardrailResult.error },
        { status: guardrailResult.status }
      );
    }

    // Task 035: staff 向け businessUnitId 自動推定（source継承対応）
    let finalBusinessUnitId = businessUnitId;
    if (requiresInference(currentUser.role)) {
      // sourceからbusinessUnitIdを継承
      let sourceBusinessUnitId: string | null = null;
      if (sourceType && sourceId) {
        const adminViewer = { userId: 'system', role: 'admin' as AppRole };
        if (sourceType === 'ticket') {
          const ticketResult = getTicketById(sourceId, adminViewer);
          if (ticketResult.success) {
            sourceBusinessUnitId = ticketResult.ticket.businessUnitId ?? null;
          }
        } else if (sourceType === 'repair') {
          const repairResult = getRepairById(sourceId, adminViewer);
          if (repairResult.success) {
            sourceBusinessUnitId = repairResult.repair.businessUnitId ?? null;
          }
        }
      }

      const inferResult = processStaffCreation(
        currentUser.id,
        currentUser.role,
        'correctiveActions',
        businessUnitId,
        { sourceBusinessUnitId }  // ヒント: source継承
      );

      if (inferResult.needsSelection) {
        return NextResponse.json(
          {
            error: inferResult.reason,
            needsSelection: true,
            candidates: inferResult.candidates,
          },
          { status: 422 }
        );
      }

      finalBusinessUnitId = inferResult.businessUnitId;
    }

    const ca = create(
      {
        title,
        description,
        severity,
        sourceType,
        sourceId,
        businessUnitId: finalBusinessUnitId ?? null,  // Task 035: 推定結果を使用
        rootCause,
        actionPlan,
        ownerUserId,
        dueAt,
      },
      currentUser.id
    );

    return NextResponse.json({ success: true, item: ca }, { status: 201 });
  } catch (error) {
    console.error('corrective-actions POST error:', error);
    return NextResponse.json(
      { error: '是正措置の作成に失敗しました' },
      { status: 500 }
    );
  }
}
