/**
 * チケットAPI
 *
 * GET /api/tickets - 一覧取得
 * POST /api/tickets - 新規作成
 *
 * Task 033: ガードレール検証
 * Task 035: staff 向け businessUnitId 自動推定
 */

import { NextRequest, NextResponse } from 'next/server';
import { listTickets, createTicket } from '@/lib/tickets/repo';
import { listByFilter as listTicketsFirestore } from '@/lib/tickets/repo.firestore';
import type { AppRole } from '@/config/appRoles';
import type { TicketStatus, TicketPriority, TicketCategory, TicketRelatedType } from '@/lib/tickets/types';
import { validateApiGuardrail } from '@/lib/scope/guardrail';
import { processStaffCreation, requiresInference } from '@/lib/scope/inferBusinessUnit';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') as TicketStatus | null;
    const priority = searchParams.get('priority') as TicketPriority | null;
    const category = searchParams.get('category') as TicketCategory | null;
    const q = searchParams.get('q');
    const my = searchParams.get('my') as 'assigned' | 'requested' | 'watching' | null;
    const overdueParam = searchParams.get('overdue');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    // Task 030: businessUnitId フィルタ
    const businessUnitIdParam = searchParams.get('businessUnitId');
    // 'null' 文字列は未分類を意味する
    const businessUnitId = businessUnitIdParam === 'null'
      ? null
      : (businessUnitIdParam ?? undefined);

    // relatedType フィルタ（vacancy_inquiry等）
    const relatedTypeParam = searchParams.get('relatedType') as TicketRelatedType | null;

    const filter = {
      status: status ?? undefined,
      priority: priority ?? undefined,
      category: category ?? undefined,
      businessUnitId,                    // Task 030
      relatedType: relatedTypeParam ?? undefined,
      q: q ?? undefined,
      my: my ?? undefined,
      overdue: overdueParam === 'true' ? true : undefined,
      limit: limitParam ? parseInt(limitParam, 10) : 50,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    };

    const viewer = { userId: user.uid, role: user.role as AppRole };

    // In-memory結果
    const { items: memoryItems, total: memoryTotal } = listTickets(filter, viewer);

    // Firestore永続チケットをマージ（vacancy_inquiry等）
    let items = memoryItems;
    let total = memoryTotal;
    try {
      const { items: fsItems } = await listTicketsFirestore(filter, viewer);
      if (fsItems.length > 0) {
        // In-memoryと重複除去（idベース）
        const memoryIds = new Set(memoryItems.map((t) => t.id));
        const newFromFs = fsItems.filter((t) => !memoryIds.has(t.id));
        items = [...memoryItems, ...newFromFs];
        total = memoryTotal + newFromFs.length;
      }
    } catch {
      // Firestore接続失敗時はIn-memoryのみで続行
    }

    return NextResponse.json({
      items,
      totalCount: total,
      limit: filter.limit,
      offset: filter.offset,
    });
  } catch (error) {
    console.error('tickets GET error:', error);
    return NextResponse.json(
      { error: 'チケットの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const body = await request.json();

    const {
      title,
      description,
      priority,
      category,
      businessUnitId,              // Task 030: 事業単位
      dueAt,
      tags,
      relatedType,
      relatedId,
      location,
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'タイトルと説明は必須です' },
        { status: 400 }
      );
    }

    // Task 033: ガードレール検証（manager/leader は businessUnitId 必須）
    const guardrailResult = validateApiGuardrail(user.role as AppRole, 'tickets', { businessUnitId });
    if (!guardrailResult.valid) {
      return NextResponse.json(
        { error: guardrailResult.error },
        { status: guardrailResult.status }
      );
    }

    // Task 035: staff 向け businessUnitId 自動推定
    let finalBusinessUnitId = businessUnitId;
    if (requiresInference(user.role as AppRole)) {
      const inferResult = await processStaffCreation(
        user.uid,
        user.role as AppRole,
        'tickets',
        businessUnitId,
        { category }  // ヒント
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

    const ticket = await createTicket(
      {
        title,
        description,
        priority,
        category,
        businessUnitId: finalBusinessUnitId,  // Task 035: 推定結果を使用
        dueAt,
        tags,
        relatedType,
        relatedId,
        location,
      },
      user.uid
    );

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error('tickets POST error:', error);
    return NextResponse.json(
      { error: 'チケットの作成に失敗しました' },
      { status: 500 }
    );
  }
}
