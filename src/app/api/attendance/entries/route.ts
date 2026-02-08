import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/attendance/entries
 *
 * 勤怠エントリ一覧取得（サーバーサイド）
 *
 * Query params:
 * - tenantId: string (必須)
 * - from: string (YYYY-MM-DD, 必須)
 * - to: string (YYYY-MM-DD, 必須)
 * - branchId?: string
 * - userId?: string
 * - includeNames?: boolean (ユーザー名を結合して返すか)
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

    // timeEntries クエリ
    let q: FirebaseFirestore.Query = adminDb
      .collection('timeEntries')
      .where('tenantId', '==', tenantId)
      .where('workDate', '>=', from)
      .where('workDate', '<=', to)
      .orderBy('workDate', 'desc');

    if (branchId) {
      q = adminDb
        .collection('timeEntries')
        .where('tenantId', '==', tenantId)
        .where('branchId', '==', branchId)
        .where('workDate', '>=', from)
        .where('workDate', '<=', to)
        .orderBy('workDate', 'desc');
    }

    const snapshot = await q.get();

    let entries = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        employeeCode: data.employeeCode,
        branchId: data.branchId,
        workDate: data.workDate,
        clockIn: data.clockIn?.toDate?.()?.toISOString() || null,
        clockOut: data.clockOut?.toDate?.()?.toISOString() || null,
        breakStart: data.breakStart?.toDate?.()?.toISOString() || null,
        breakEnd: data.breakEnd?.toDate?.()?.toISOString() || null,
        actualBreakMinutes: data.actualBreakMinutes || 0,
        totalWorkMinutes: data.totalWorkMinutes || 0,
        overtimeMinutes: data.overtimeMinutes || 0,
        lateNightMinutes: data.lateNightMinutes || 0,
        status: data.status,
        isEdited: data.isEdited || false,
        editedByName: data.editedByName || null,
        editReason: data.editReason || null,
        userName: null as string | null,
      };
    });

    // userId フィルタ（クエリに組み込めない場合のクライアント側フィルタ）
    if (userId) {
      entries = entries.filter((e) => e.userId === userId);
    }

    // ユーザー名結合
    if (includeNames) {
      const userIds = [...new Set(entries.map((e) => e.userId))];

      // users コレクションからまとめて取得
      const userMap = new Map<string, string>();
      if (userIds.length > 0) {
        // Firestore 'in' clause max 30
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
      }

      entries = entries.map((e) => ({
        ...e,
        userName: userMap.get(e.userId) || e.employeeCode,
      }));
    }

    return NextResponse.json(
      { entries, count: entries.length },
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
