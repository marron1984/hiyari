/**
 * クレーム担当割当API
 *
 * POST /api/complaints/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getComplaintById, assignComplaint } from '@/lib/complaints/repo';
import { canManageComplaints } from '@/lib/complaints/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!canManageComplaints(currentUser)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { assigneeUserId } = body;

    const result = assignComplaint(id, assigneeUserId, currentUser.id);

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
