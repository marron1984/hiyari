/**
 * クレーム一覧・作成API
 *
 * GET  /api/complaints - 一覧取得
 * POST /api/complaints - 新規作成（manager+）
 */

import { NextRequest, NextResponse } from 'next/server';
import { listComplaints, createComplaint } from '@/lib/complaints/repo.firestore';
import { canManageComplaints } from '@/lib/complaints/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import type { ComplaintStatus, ComplaintSeverity, ComplaintCategory } from '@/lib/complaints/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);

    const filter = {
      status: searchParams.get('status') as ComplaintStatus | undefined,
      severity: searchParams.get('severity') as ComplaintSeverity | undefined,
      category: searchParams.get('category') as ComplaintCategory | undefined,
      overdue: searchParams.get('overdue') === 'true' ? true : undefined,
      myAssigned: searchParams.get('myAssigned') === 'true' ? true : undefined,
      q: searchParams.get('q') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    };

    const result = await listComplaints({ userId: user.uid, role: user.role as AppRole }, filter);

    return NextResponse.json({
      success: true,
      complaints: result.complaints,
      total: result.total,
    });
  } catch (error) {
    console.error('クレーム一覧取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クレーム一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { title, description, category, severity, requesterType, requesterName, contactHint, occurredAt, dueAt } = body;

    if (!title || !description || !category || !severity || !requesterType) {
      return NextResponse.json(
        { success: false, error: '必須項目が不足しています' },
        { status: 400 }
      );
    }

    const result = await createComplaint(
      { title, description, category, severity, requesterType, requesterName, contactHint, occurredAt, dueAt },
      user.uid
    );

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
    console.error('クレーム作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クレームの作成に失敗しました' },
      { status: 500 }
    );
  }
}
