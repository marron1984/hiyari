/**
 * 研修セッションステータス変更API
 *
 * POST /api/training/sessions/[id]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { setSessionStatus } from '@/lib/training/repo';
import { canManageTraining } from '@/lib/training/types';
import type { AppRole } from '@/config/appRoles';
import type { SessionStatus } from '@/lib/training/types';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

const VALID_STATUSES: SessionStatus[] = ['planned', 'done', 'cancelled'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };

    if (!canManageTraining(viewer)) {
      return NextResponse.json(
        { error: 'ステータスを変更する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: '有効なステータスを指定してください' },
        { status: 400 }
      );
    }

    const result = setSessionStatus(id, status, DEMO_USER.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({ session: result.session });
  } catch (error) {
    console.error('training session status POST error:', error);
    return NextResponse.json(
      { error: 'ステータスの変更に失敗しました' },
      { status: 500 }
    );
  }
}
