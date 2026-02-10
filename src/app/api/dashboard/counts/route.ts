import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/dashboard/counts
 *
 * ダッシュボード用のモジュール別カウント（全機能）
 *
 * Query params:
 * - tenantId: string (必須)
 */

function getDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId は必須です' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const now = new Date();
    const today = getDateStr(now);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 並列で全モジュールのカウントを取得
    const [
      prospectsResult,
      vacanciesResult,
      attendanceResult,
      approvalsResult,
      incidentsResult,
      improvementsResult,
      documentsResult,
      salesResult,
      osResult,
    ] = await Promise.all([
      // ── Prospects ──
      (async () => {
        try {
          const snap = await adminDb
            .collection('prospects')
            .where('tenantId', '==', tenantId)
            .get();

          const total = snap.size;
          let newThisWeek = 0;
          const byStatus: Record<string, number> = {};

          snap.docs.forEach((doc) => {
            const data = doc.data();
            const status = data.status || '新規受付';
            byStatus[status] = (byStatus[status] || 0) + 1;

            const receivedAt = data.receivedAt?.toDate?.() || data.createdAt?.toDate?.();
            if (receivedAt && receivedAt >= weekAgo) {
              newThisWeek++;
            }
          });

          return { total, newThisWeek, byStatus };
        } catch {
          return { total: 0, newThisWeek: 0, byStatus: {} };
        }
      })(),

      // ── Vacancies ──
      (async () => {
        try {
          const facilitiesSnap = await adminDb
            .collection('facilities')
            .where('tenantId', '==', tenantId)
            .where('isActive', '==', true)
            .get();

          const vacancySnap = await adminDb
            .collection('vacancyStatus')
            .get();

          const vacancyMap = new Map<string, number>();
          vacancySnap.docs.forEach((d) => {
            vacancyMap.set(d.id, d.data().vacantCount ?? 0);
          });

          let totalCapacity = 0;
          let totalVacant = 0;

          facilitiesSnap.docs.forEach((d) => {
            const data = d.data();
            const capacity = data.capacity || 0;
            totalCapacity += capacity;
            totalVacant += vacancyMap.get(d.id) ?? 0;
          });

          const occupancyRate = totalCapacity > 0
            ? Math.round(((totalCapacity - totalVacant) / totalCapacity) * 100)
            : 0;

          return { totalCapacity, totalVacant, occupancyRate, facilityCount: facilitiesSnap.size };
        } catch {
          return { totalCapacity: 0, totalVacant: 0, occupancyRate: 0, facilityCount: 0 };
        }
      })(),

      // ── Attendance ──
      (async () => {
        try {
          const todaySnap = await adminDb
            .collection('timeEntries')
            .where('tenantId', '==', tenantId)
            .where('workDate', '==', today)
            .get();

          const todayClockedIn = todaySnap.size;
          const working = todaySnap.docs.filter((d) => {
            const status = d.data().status;
            return status === 'working' || status === 'on_break';
          }).length;

          // 未承認残業
          let pendingOvertime = 0;
          try {
            const overtimeSnap = await adminDb
              .collection('overtimeRequests')
              .where('tenantId', '==', tenantId)
              .where('status', '==', 'pending')
              .get();
            pendingOvertime = overtimeSnap.size;
          } catch {
            // Index may not exist
          }

          return { todayClockedIn, working, pendingOvertime };
        } catch {
          return { todayClockedIn: 0, working: 0, pendingOvertime: 0 };
        }
      })(),

      // ── Approvals ──
      (async () => {
        try {
          const ringisSnap = await adminDb
            .collection('ringis')
            .where('tenantId', '==', tenantId)
            .get();

          let pending = 0;
          let todayNew = 0;
          const total = ringisSnap.size;

          ringisSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.status === 'submitted') {
              pending++;
            }
            const createdAt = data.createdAt?.toDate?.();
            if (createdAt && getDateStr(createdAt) === today) {
              todayNew++;
            }
          });

          return { pending, todayNew, total };
        } catch {
          return { pending: 0, todayNew: 0, total: 0 };
        }
      })(),

      // ── Incidents ──
      (async () => {
        try {
          const snap = await adminDb
            .collection('incidents')
            .where('tenantId', '==', tenantId)
            .get();

          const total = snap.size;
          let thisMonth = 0;
          let fraudFlagged = 0;

          snap.docs.forEach((d) => {
            const data = d.data();
            const createdAt = data.createdAt?.toDate?.();
            if (createdAt && createdAt >= monthStart) {
              thisMonth++;
            }
            if (data.fraudFlag) {
              fraudFlagged++;
            }
          });

          return { thisMonth, total, fraudFlagged };
        } catch {
          return { thisMonth: 0, total: 0, fraudFlagged: 0 };
        }
      })(),

      // ── Improvements ──
      (async () => {
        try {
          const snap = await adminDb
            .collection('improvements')
            .where('tenantId', '==', tenantId)
            .get();

          const total = snap.size;
          let adopted = 0;
          let pendingReview = 0;

          snap.docs.forEach((d) => {
            const data = d.data();
            if (data.status === 'adopted') {
              adopted++;
            }
            if (data.status === 'submitted' || data.status === 'reviewing') {
              pendingReview++;
            }
          });

          return { total, adopted, pendingReview };
        } catch {
          return { total: 0, adopted: 0, pendingReview: 0 };
        }
      })(),

      // ── Documents ──
      (async () => {
        try {
          const snap = await adminDb
            .collection('documents')
            .where('tenantId', '==', tenantId)
            .get();

          const total = snap.size;
          let missing = 0;
          let submitted = 0;

          snap.docs.forEach((d) => {
            const data = d.data();
            if (data.status === 'MISSING' || data.status === 'EXPIRED') {
              missing++;
            }
            if (data.status === 'SUBMITTED' || data.status === 'APPROVED' || data.status === 'SIGNED') {
              submitted++;
            }
          });

          return { total, missing, submitted };
        } catch {
          return { total: 0, missing: 0, submitted: 0 };
        }
      })(),

      // ── Sales ──
      (async () => {
        try {
          const dealsSnap = await adminDb
            .collection('salesDeals')
            .where('tenantId', '==', tenantId)
            .get();

          const accountsSnap = await adminDb
            .collection('salesAccounts')
            .where('tenantId', '==', tenantId)
            .get();

          let activeDeals = 0;
          let staleDeals = 0;
          const staleCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          dealsSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.status === 'active' || data.status === 'negotiating' || data.status === 'proposal') {
              activeDeals++;
              const updatedAt = data.updatedAt?.toDate?.();
              if (updatedAt && updatedAt < staleCutoff) {
                staleDeals++;
              }
            }
          });

          return { activeDeals, staleDeals, totalAccounts: accountsSnap.size };
        } catch {
          return { activeDeals: 0, staleDeals: 0, totalAccounts: 0 };
        }
      })(),

      // ── OS (Staff Condition) ──
      (async () => {
        try {
          const checkinsSnap = await adminDb
            .collection('staffCheckins')
            .where('tenantId', '==', tenantId)
            .where('date', '==', today)
            .get();

          const todayCheckins = checkinsSnap.size;
          let yellowRisk = 0;
          let redRisk = 0;

          checkinsSnap.docs.forEach((d) => {
            const data = d.data();
            const burnoutScore = data.burnoutScore ?? data.burnoutRisk ?? 0;
            if (burnoutScore >= 60) {
              redRisk++;
            } else if (burnoutScore >= 40) {
              yellowRisk++;
            }
          });

          return { todayCheckins, yellowRisk, redRisk };
        } catch {
          return { todayCheckins: 0, yellowRisk: 0, redRisk: 0 };
        }
      })(),
    ]);

    return NextResponse.json(
      {
        prospects: prospectsResult,
        vacancies: vacanciesResult,
        attendance: attendanceResult,
        approvals: approvalsResult,
        incidents: incidentsResult,
        improvements: improvementsResult,
        documents: documentsResult,
        sales: salesResult,
        os: osResult,
        fetchedAt: now.toISOString(),
      },
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
