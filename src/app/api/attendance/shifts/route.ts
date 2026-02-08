import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/attendance/shifts
 *
 * シフト一覧取得（サーバーサイド）
 *
 * Query params:
 * - tenantId: string (必須)
 * - from: string (YYYY-MM-DD, 必須)
 * - to: string (YYYY-MM-DD, 必須)
 * - branchId?: string
 * - userId?: string
 * - includeNames?: boolean
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tenantId = searchParams.get('tenantId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const branchId = searchParams.get('branchId');
    const userId = searchParams.get('userId');
    const includeNames = searchParams.get('includeNames') === 'true';

    if (!tenantId || !from || !to) {
      return NextResponse.json(
        { error: 'tenantId, from, to は必須です' },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();

    let q: FirebaseFirestore.Query = adminDb
      .collection('workShifts')
      .where('tenantId', '==', tenantId)
      .where('workDate', '>=', from)
      .where('workDate', '<=', to)
      .orderBy('workDate', 'desc');

    if (branchId) {
      q = adminDb
        .collection('workShifts')
        .where('tenantId', '==', tenantId)
        .where('branchId', '==', branchId)
        .where('workDate', '>=', from)
        .where('workDate', '<=', to)
        .orderBy('workDate', 'desc');
    }

    const snapshot = await q.get();

    let shifts = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        employeeCode: data.employeeCode,
        branchId: data.branchId,
        workDate: data.workDate,
        plannedStart: data.plannedStart,
        plannedEnd: data.plannedEnd,
        breakMinutes: data.breakMinutes || 0,
        shiftType: data.shiftType,
        source: data.source,
        userName: null as string | null,
      };
    });

    if (userId) {
      shifts = shifts.filter((s) => s.userId === userId);
    }

    if (includeNames) {
      const userIds = [...new Set(shifts.map((s) => s.userId))];
      const userMap = new Map<string, string>();

      for (let i = 0; i < userIds.length; i += 30) {
        const chunk = userIds.slice(i, i + 30);
        const usersSnap = await adminDb
          .collection('users')
          .where('__name__', 'in', chunk)
          .get();
        usersSnap.docs.forEach((d) => {
          userMap.set(d.id, d.data().name || d.data().email || d.id);
        });
      }

      shifts = shifts.map((s) => ({
        ...s,
        userName: userMap.get(s.userId) || s.employeeCode,
      }));
    }

    return NextResponse.json(
      { shifts, count: shifts.length },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
