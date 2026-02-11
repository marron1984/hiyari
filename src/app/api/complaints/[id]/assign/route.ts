/**
 * クレーム担当割当API
 *
 * POST /api/complaints/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { getComplaintById, assignComplaint } from '@/lib/complaints/repo';
import { canManageComplaints } from '@/lib/complaints/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canManageComplaints({ userId: user.uid, role: user.role as AppRole })) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { assigneeUserId } = body;

    const result = assignComplaint(id, assigneeUserId, user.uid);

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
