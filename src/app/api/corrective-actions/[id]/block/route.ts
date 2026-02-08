/**
 * POST /api/corrective-actions/[id]/block
 *
 * Ticket 131: 改善タスクをブロック状態にする
 *
 * body:
 * { blockedReasonCode, blockedReasonNote?, nextReviewAt? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { blockAction } from '@/lib/correctiveActions/repo';
import type { BlockedReasonCode } from '@/lib/correctiveActions/types';
import { BLOCKED_REASON_CODES } from '@/lib/correctiveActions/types';
import type { AppRole } from '@/config/appRoles';

const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { blockedReasonCode, blockedReasonNote, nextReviewAt } = body;

    // バリデーション
    if (!blockedReasonCode || !BLOCKED_REASON_CODES.includes(blockedReasonCode as BlockedReasonCode)) {
      return NextResponse.json(
        { error: 'blockedReasonCode は必須です（有効な値を指定してください）' },
        { status: 400 }
      );
    }

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    const result = blockAction(
      id,
      {
        blockedReasonCode: blockedReasonCode as BlockedReasonCode,
        blockedReasonNote: blockedReasonNote ?? undefined,
        nextReviewAt: nextReviewAt ?? undefined,
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
      success: true,
      item: result.item,
      event: result.event,
    });
  } catch (error) {
    console.error('corrective-actions block POST error:', error);
    return NextResponse.json(
      { error: 'ブロック処理に失敗しました' },
      { status: 500 }
    );
  }
}
