/**
 * アクション項目一覧API
 *
 * GET /api/committees/action-items - アクション項目一覧取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { listActionItems } from '@/lib/committees/repo';
import type { ActionItemStatus } from '@/lib/committees/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId') || undefined;
    const committeeId = searchParams.get('committeeId') || undefined;
    const status = searchParams.get('status') as ActionItemStatus | undefined;
    const overdueParam = searchParams.get('overdue');
    const overdue = overdueParam === 'true' ? true : undefined;
    const ownerUserId = searchParams.get('ownerUserId') || undefined;

    const actionItems = listActionItems({
      meetingId,
      committeeId,
      status,
      overdue,
      ownerUserId,
    });

    return NextResponse.json({
      success: true,
      actionItems,
      total: actionItems.length,
    });
  } catch (error) {
    console.error('アクション項目一覧取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アクション項目一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
