/**
 * クレーム統計API
 *
 * GET /api/complaints/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStats } from '@/lib/complaints/repo.firestore';
import { canViewComplaintStats } from '@/lib/complaints/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!canViewComplaintStats({ userId: user.uid, role: user.role as AppRole })) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 }
      );
    }

    const stats = await getStats({ userId: user.uid, role: user.role as AppRole });

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('統計取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
