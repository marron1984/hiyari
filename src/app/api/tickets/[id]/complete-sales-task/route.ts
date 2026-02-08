/**
 * 営業タスク完了API
 *
 * POST /api/tickets/[id]/complete-sales-task
 *
 * Ticket 123: 営業タスク完了時の結果入力
 */

import { NextRequest, NextResponse } from 'next/server';
import { completeSalesTask } from '@/lib/tickets/repo';
import type { AppRole } from '@/config/appRoles';
import type { SalesTaskResultCode } from '@/lib/tickets/types';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

const VALID_RESULT_CODES: SalesTaskResultCode[] = [
  'contacted_success',
  'no_answer',
  'wrong_number',
  'not_interested',
  'needs_more_time',
  'tour_scheduled',
  'applied',
  'accepted',
  'rejected',
  'other',
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { resultCode, resultNote, nextFollowUpAt } = body;

    // resultCode バリデーション（必須）
    if (!resultCode) {
      return NextResponse.json(
        { error: '結果コード（resultCode）は必須です' },
        { status: 400 }
      );
    }

    if (!VALID_RESULT_CODES.includes(resultCode)) {
      return NextResponse.json(
        { error: '無効な結果コードです' },
        { status: 400 }
      );
    }

    // nextFollowUpAt バリデーション（任意、ISO日付形式）
    if (nextFollowUpAt && isNaN(Date.parse(nextFollowUpAt))) {
      return NextResponse.json(
        { error: '次回フォローアップ日時が不正です' },
        { status: 400 }
      );
    }

    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    const result = completeSalesTask(
      id,
      {
        resultCode,
        resultNote: resultNote ?? undefined,
        nextFollowUpAt: nextFollowUpAt ?? undefined,
      },
      viewer
    );

    if (!result.success) {
      const statusCode = result.error === 'チケットが見つかりません' ? 404 : 403;
      return NextResponse.json(
        { error: result.error },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      ticket: result.ticket,
    });
  } catch (error) {
    console.error('complete-sales-task POST error:', error);
    return NextResponse.json(
      { error: '営業タスクの完了に失敗しました' },
      { status: 500 }
    );
  }
}
