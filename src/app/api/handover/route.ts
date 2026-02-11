/**
 * 申し送りAPI
 *
 * GET /api/handover - 一覧取得
 * POST /api/handover - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listHandoverItems,
  createHandoverItem,
} from '@/lib/handover/repo.firestore';
import { createAlertAsync } from '@/lib/alerts/repo.firestore';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { HandoverStatus, HandoverPriority, HandoverShift } from '@/lib/handover/types';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') as HandoverStatus | null;
    const priority = searchParams.get('priority') as HandoverPriority | null;
    const shift = searchParams.get('shift') as HandoverShift | null;
    const tag = searchParams.get('tag');
    const q = searchParams.get('q');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const filter = {
      status: status ?? undefined,
      priority: priority ?? undefined,
      shift: shift ?? undefined,
      tag: tag ?? undefined,
      q: q ?? undefined,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
      limit: limitParam ? parseInt(limitParam, 10) : 50,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    };

    const { items, total } = await listHandoverItems(filter, user.role as AppRole, user.uid);

    return NextResponse.json({
      items,
      totalCount: total,
      limit: filter.limit,
      offset: filter.offset,
    });
  } catch (error) {
    console.error('handover GET error:', error);
    return NextResponse.json(
      { error: '申し送りの取得に失敗しました' },
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

    const { title, body: itemBody, priority, targetRoles, targetUserIds, dueAt, shift, tags } = body;

    if (!title || !itemBody) {
      return NextResponse.json(
        { error: 'タイトルと本文は必須です' },
        { status: 400 }
      );
    }

    const item = await createHandoverItem(
      {
        title,
        body: itemBody,
        priority,
        targetRoles,
        targetUserIds,
        dueAt,
        shift,
        tags,
      },
      user.uid,
      user.name
    );

    // urgentの場合はアラートセンターに通知
    if (priority === 'urgent') {
      await createAlertAsync({
        type: 'handover_urgent',
        sourceId: item.id,
        title: `【重要】申し送り：${title}`,
        message: itemBody.length > 100 ? itemBody.slice(0, 100) + '...' : itemBody,
        severity: 'critical',
        fingerprint: `handover_urgent:${item.id}`,
        meta: {
          handoverId: item.id,
          createdBy: user.name,
          url: `/dashboard/handover/${item.id}`,
        },
      });
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('handover POST error:', error);
    return NextResponse.json(
      { error: '申し送りの作成に失敗しました' },
      { status: 500 }
    );
  }
}
