/**
 * クレーム担当割当API
 *
 * POST /api/complaints/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { getComplaintById, assignComplaint } from '@/lib/complaints/repo';
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
    const { assigneeUserId } = body;

    const result = assignComplaint(id, assigneeUserId, DEMO_USER.userId);

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
    console.error('担当割当エラー:', error);
    return NextResponse.json(
      { success: false, error: '担当の割当に失敗しました' },
      { status: 500 }
    );
  }
}
