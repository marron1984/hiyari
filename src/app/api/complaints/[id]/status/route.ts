/**
 * クレームステータス変更API
 *
 * POST /api/complaints/[id]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import { getComplaintById, changeStatus } from '@/lib/complaints/repo';
import { canEditComplaint } from '@/lib/complaints/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const complaint = getComplaintById(id, currentUser);

    if (!complaint) {
      return NextResponse.json(
        { success: false, error: 'クレームが見つかりません' },
        { status: 404 }
      );
    }

    if (!canEditComplaint(currentUser, complaint)) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json(
        { success: false, error: 'ステータスを指定してください' },
        { status: 400 }
      );
    }

    const result = changeStatus(id, status, currentUser.id);

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
    console.error('ステータス変更エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ステータスの変更に失敗しました' },
      { status: 500 }
    );
  }
}
