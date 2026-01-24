/**
 * /api/os/interventions
 * 介入タスク管理API
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getInterventions,
  updateIntervention,
  resolveIntervention,
  createAuditLog,
} from '@/lib/chaos';
import { SUPPORT_PURPOSE_TEXT } from '@/types/chaos';

// GET: 介入タスク一覧取得
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'open' | 'done' | 'snoozed' | null;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const interventions = await getInterventions(status || undefined, limit);

    return NextResponse.json({
      success: true,
      interventions,
      count: interventions.length,
      supportText: SUPPORT_PURPOSE_TEXT,
    });
  } catch (error) {
    console.error('Interventions GET API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// PATCH: 介入タスク更新（完了・スヌーズ）
export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const userName = request.headers.get('x-user-name');

    if (!userId || !userName) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'JSONのパースに失敗しました' },
        { status: 400 }
      );
    }

    const interventionId = body.interventionId as string;
    const action = body.action as string;

    if (!interventionId) {
      return NextResponse.json(
        { error: 'interventionIdは必須です' },
        { status: 400 }
      );
    }

    if (!['resolve', 'snooze', 'reopen'].includes(action)) {
      return NextResponse.json(
        { error: 'actionは resolve, snooze, reopen のいずれかを指定してください' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'resolve':
        await resolveIntervention(interventionId, userId);
        break;
      case 'snooze':
        await updateIntervention(interventionId, { status: 'snoozed' });
        break;
      case 'reopen':
        await updateIntervention(interventionId, { status: 'open' });
        break;
    }

    // 監査ログ
    await createAuditLog(
      userId,
      userName,
      `intervention_${action}`,
      'interventions',
      interventionId
    );

    return NextResponse.json({
      success: true,
      action,
      interventionId,
      message: action === 'resolve' ? '対応完了としてマークしました' :
               action === 'snooze' ? 'スヌーズしました' :
               '再オープンしました',
      supportText: SUPPORT_PURPOSE_TEXT,
    });
  } catch (error) {
    console.error('Interventions PATCH API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
