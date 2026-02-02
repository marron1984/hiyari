/**
 * クレーム期限設定API
 *
 * POST /api/complaints/[id]/due
 */

import { NextRequest, NextResponse } from 'next/server';
import { setDueAt } from '@/lib/complaints/repo';
import { canManageComplaints } from '@/lib/complaints/types';

const DEMO_USER = {
  userId: 'user_manager',
  role: 'manager' as const,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!canManageComplaints(DEMO_USER)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { dueAt } = body;

    const result = setDueAt(id, dueAt, DEMO_USER.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      complaint: result.complaint,
    });
  } catch (error) {
    console.error('期限設定エラー:', error);
    return NextResponse.json(
      { success: false, error: '期限の設定に失敗しました' },
      { status: 500 }
    );
  }
}
