// ======== 管理レポート・分析API ========
// GET /api/admin/reports?type=incidents|prospects|staff&months=6

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';

const DEFAULT_TENANT_ID = 'defaultTenant';

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyIdToken(authHeader.substring(7));
}

// 月の開始日を返す（YYYY-MM-DD）
function getMonthStart(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

// 月ラベル（YYYY-MM）
function getMonthLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// 過去N月分の月リストを返す
function getMonthRange(months: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(getMonthLabel(d));
  }
  return result;
}

// ========== インシデント傾向分析 ==========
async function getIncidentTrends(tenantId: string, months: number) {
  const db = getAdminDb();
  const monthRange = getMonthRange(months);
  const startDate = monthRange[0] + '-01';

  const snapshot = await db
    .collection('incidents')
    .where('tenantId', '==', tenantId)
    .where('date', '>=', startDate)
    .orderBy('date', 'asc')
    .get();

  // 月別・カテゴリ別集計
  const byMonth: Record<string, Record<string, number>> = {};
  const bySeverity: Record<string, Record<number, number>> = {};
  const categoryTotals: Record<string, number> = {};
  let total = 0;

  for (const month of monthRange) {
    byMonth[month] = {};
    bySeverity[month] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const month = data.date?.substring(0, 7);
    if (!month || !byMonth[month]) continue;

    total++;
    const category = data.category || 'その他';
    byMonth[month][category] = (byMonth[month][category] || 0) + 1;
    categoryTotals[category] = (categoryTotals[category] || 0) + 1;

    const severity = data.severity || 1;
    bySeverity[month][severity] = (bySeverity[month][severity] || 0) + 1;
  }

  // 月別合計
  const monthlyTotals = monthRange.map(month => ({
    month,
    total: Object.values(byMonth[month]).reduce((a, b) => a + b, 0),
    ...byMonth[month],
  }));

  // 重要度分布
  const severityByMonth = monthRange.map(month => ({
    month,
    ...bySeverity[month],
  }));

  // 上位カテゴリ
  const topCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, rate: total > 0 ? Math.round((count / total) * 100) : 0 }));

  return { monthlyTotals, severityByMonth, topCategories, total, monthRange };
}

// ========== 入居希望者コンバージョン分析 ==========
async function getProspectConversion(tenantId: string, months: number) {
  const db = getAdminDb();

  const snapshot = await db
    .collection('prospects')
    .where('tenantId', '==', tenantId)
    .get();

  const statusOrder = [
    '新規受付', '折返し待ち', '面談設定済', '見学設定済',
    '申込中', '審査中', '入居待ち', '入居決定', '見送り', 'クローズ',
  ];

  // ファネル: 全件のステータス分布
  const statusCounts: Record<string, number> = {};
  for (const s of statusOrder) statusCounts[s] = 0;

  // 月別の新規・成約数
  const monthRange = getMonthRange(months);
  const monthlyNew: Record<string, number> = {};
  const monthlyConverted: Record<string, number> = {};
  const monthlyClosed: Record<string, number> = {};
  for (const m of monthRange) {
    monthlyNew[m] = 0;
    monthlyConverted[m] = 0;
    monthlyClosed[m] = 0;
  }

  // 紹介元集計
  const sourceCounts: Record<string, number> = {};
  let totalProspects = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    totalProspects++;

    const status = data.status || '新規受付';
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    // createdAtから月を取得
    const createdAt = data.createdAt?.toDate?.() || data.createdAt;
    if (createdAt) {
      const month = getMonthLabel(new Date(createdAt));
      if (monthlyNew[month] !== undefined) {
        monthlyNew[month]++;
      }
      if (status === '入居決定' && monthlyConverted[month] !== undefined) {
        monthlyConverted[month]++;
      }
      if ((status === '見送り' || status === 'クローズ') && monthlyClosed[month] !== undefined) {
        monthlyClosed[month]++;
      }
    }

    // 紹介元
    const source = data.referralSource || data.source || '不明';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  }

  // ファネルデータ
  const funnel = statusOrder.map(status => ({
    status,
    count: statusCounts[status] || 0,
  }));

  // 月別推移
  const monthlyTrend = monthRange.map(month => ({
    month,
    newCount: monthlyNew[month],
    converted: monthlyConverted[month],
    closed: monthlyClosed[month],
  }));

  // コンバージョン率
  const convertedTotal = statusCounts['入居決定'] || 0;
  const conversionRate = totalProspects > 0 ? Math.round((convertedTotal / totalProspects) * 1000) / 10 : 0;

  // 紹介元上位
  const topSources = Object.entries(sourceCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, rate: totalProspects > 0 ? Math.round((count / totalProspects) * 100) : 0 }));

  return { funnel, monthlyTrend, conversionRate, totalProspects, topSources, monthRange };
}

// ========== スタッフ稼働率レポート ==========
async function getStaffUtilization(tenantId: string, months: number) {
  const db = getAdminDb();
  const monthRange = getMonthRange(months);
  const startMonth = monthRange[0];

  // ユーザー一覧
  const usersSnap = await db
    .collection('users')
    .where('tenantId', '==', tenantId)
    .get();

  const users: Record<string, { name: string; branchId: string }> = {};
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    users[doc.id] = { name: data.name || data.email || 'Unknown', branchId: data.branchId || '' };
  }

  // 勤怠記録
  const attendanceSnap = await db
    .collection('attendanceRecords')
    .where('tenantId', '==', tenantId)
    .where('date', '>=', startMonth + '-01')
    .get();

  // ユーザー別集計
  const userStats: Record<string, {
    userId: string; name: string; branchId: string;
    workDays: number; totalMinutes: number; overtimeMinutes: number;
    lateCount: number; absentDays: Set<string>;
  }> = {};

  // 月別全体集計
  const monthlyStats: Record<string, {
    totalWorkDays: number; totalMinutes: number; overtimeMinutes: number;
    lateCount: number; staffCount: Set<string>;
  }> = {};
  for (const m of monthRange) {
    monthlyStats[m] = { totalWorkDays: 0, totalMinutes: 0, overtimeMinutes: 0, lateCount: 0, staffCount: new Set() };
  }

  for (const doc of attendanceSnap.docs) {
    const data = doc.data();
    const userId = data.userId;
    const month = data.date?.substring(0, 7);
    if (!month || !monthlyStats[month]) continue;

    if (!userStats[userId]) {
      const userInfo = users[userId] || { name: 'Unknown', branchId: '' };
      userStats[userId] = {
        userId, name: userInfo.name, branchId: userInfo.branchId,
        workDays: 0, totalMinutes: 0, overtimeMinutes: 0,
        lateCount: 0, absentDays: new Set(),
      };
    }

    const stats = userStats[userId];
    const ms = monthlyStats[month];

    if (data.clockIn) {
      stats.workDays++;
      ms.totalWorkDays++;
      ms.staffCount.add(userId);

      // 勤務時間算出
      const clockIn = data.clockIn?.toDate?.() || new Date(data.clockIn);
      const clockOut = data.clockOut?.toDate?.() || (data.clockOut ? new Date(data.clockOut) : null);

      if (clockOut) {
        const minutes = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000);
        const breakMinutes = data.breakMinutes || 0;
        const workMinutes = Math.max(0, minutes - breakMinutes);
        stats.totalMinutes += workMinutes;
        ms.totalMinutes += workMinutes;

        // 残業（8時間=480分超過分）
        const overtime = Math.max(0, workMinutes - 480);
        stats.overtimeMinutes += overtime;
        ms.overtimeMinutes += overtime;
      }

      // 遅刻
      if (data.isLate) {
        stats.lateCount++;
        ms.lateCount++;
      }
    }
  }

  // スタッフ別サマリ
  const staffSummary = Object.values(userStats)
    .map(s => ({
      userId: s.userId,
      name: s.name,
      branchId: s.branchId,
      workDays: s.workDays,
      totalHours: Math.round(s.totalMinutes / 60 * 10) / 10,
      overtimeHours: Math.round(s.overtimeMinutes / 60 * 10) / 10,
      avgHoursPerDay: s.workDays > 0 ? Math.round(s.totalMinutes / s.workDays / 60 * 10) / 10 : 0,
      lateCount: s.lateCount,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  // 月別推移
  const monthlyTrend = monthRange.map(month => {
    const ms = monthlyStats[month];
    const staffCount = ms.staffCount.size;
    return {
      month,
      staffCount,
      totalHours: Math.round(ms.totalMinutes / 60),
      overtimeHours: Math.round(ms.overtimeMinutes / 60),
      avgHoursPerStaff: staffCount > 0 ? Math.round(ms.totalMinutes / staffCount / 60 * 10) / 10 : 0,
      lateCount: ms.lateCount,
      workDays: ms.totalWorkDays,
    };
  });

  return { staffSummary, monthlyTrend, monthRange, totalStaff: Object.keys(users).length };
}

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await authenticate(request);
    if (!decodedToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者チェック
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userRole = userDoc.data()?.role || 'user';
    if (!hasMinRole(userRole, 'leader')) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type') || 'incidents';
    const months = Math.min(Math.max(parseInt(searchParams.get('months') || '6', 10), 1), 12);
    const tenantId = userDoc.data()?.tenantId || DEFAULT_TENANT_ID;

    let data;
    switch (reportType) {
      case 'incidents':
        data = await getIncidentTrends(tenantId, months);
        break;
      case 'prospects':
        data = await getProspectConversion(tenantId, months);
        break;
      case 'staff':
        data = await getStaffUtilization(tenantId, months);
        break;
      default:
        return NextResponse.json({ error: '無効なレポートタイプです' }, { status: 400 });
    }

    return NextResponse.json({ success: true, reportType, months, data });
  } catch (error) {
    console.error('reports GET error:', error);
    return NextResponse.json({ error: 'レポートの取得に失敗しました' }, { status: 500 });
  }
}
