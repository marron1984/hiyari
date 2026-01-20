// ======== 勤怠サマリー・アラート機能 ========

import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { getTodayJST } from './attendance-calc';
import { ClockStatus } from '@/types/attendance';
import { EMPLOYEES_SEED, BRANCHES_SEED } from '@/data/employees';

// ======== 型定義 ========

export interface TodaySummary {
  total: number;           // 従業員総数
  clockedIn: number;       // 出勤済
  working: number;         // 勤務中
  onBreak: number;         // 休憩中
  completed: number;       // 退勤済
  notStarted: number;      // 未打刻
  late: number;            // 遅刻
}

export interface MonthlySummary {
  totalWorkMinutes: number;      // 総労働時間（分）
  totalOvertimeMinutes: number;  // 総残業時間（承認済み・分）
  totalLateNightMinutes: number; // 総深夜時間（分）
  totalBreakMinutes: number;     // 総休憩時間（分）
  workDays: number;              // 出勤日数
  avgWorkMinutesPerDay: number;  // 日平均労働時間
}

export interface AttendanceAlert {
  id: string;
  type: 'missing_clock' | 'long_hours' | 'missing_break' | 'overtime_pending';
  severity: 'warning' | 'error' | 'info';
  employeeName: string;
  employeeCode: string;
  message: string;
  date: string;
  value?: number;  // 時間などの数値
}

export interface EmployeeAttendanceStatus {
  employeeCode: string;
  name: string;
  branchId: string;
  branchName: string;
  status: ClockStatus;
  clockIn?: Date;
  clockOut?: Date;
  workMinutes?: number;
  isLate: boolean;
  qualification?: string;
}

// ======== 今日のサマリー ========

export async function getTodaySummary(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TodaySummary> {
  if (!db) throw new Error('Firestore not initialized');

  const today = getTodayJST();

  // 従業員総数（クエリを簡素化してインデックス不要に）
  let totalEmployees = EMPLOYEES_SEED.length; // デフォルトはシードデータの数
  try {
    const employeesQuery = query(
      collection(db, 'employees'),
      where('tenantId', '==', tenantId)
    );
    const employeesSnapshot = await getDocs(employeesQuery);
    // クライアント側でisActiveをフィルタ
    const activeEmployees = employeesSnapshot.docs.filter(doc => doc.data().isActive === true);
    if (activeEmployees.length > 0) {
      totalEmployees = activeEmployees.length;
    }
  } catch (error) {
    console.error('Failed to fetch employees, using seed data:', error);
  }

  // 今日の打刻記録（単一フィルターに簡素化）
  const entriesQuery = query(
    collection(db, 'timeEntries'),
    where('workDate', '==', today)
  );
  const entriesSnapshot = await getDocs(entriesQuery);
  // クライアント側でtenantIdフィルタ
  const todayEntries = entriesSnapshot.docs.filter(doc => doc.data().tenantId === tenantId);

  let working = 0;
  let onBreak = 0;
  let completed = 0;
  let late = 0;

  todayEntries.forEach((doc) => {
    const data = doc.data();
    const status = data.status as ClockStatus;

    if (status === 'working') working++;
    else if (status === 'on_break') onBreak++;
    else if (status === 'completed') completed++;

    // 遅刻判定（9:00以降の出勤を遅刻とみなす簡易ロジック）
    if (data.clockIn) {
      const clockIn = data.clockIn.toDate();
      const hour = clockIn.getHours();
      if (hour >= 9) late++;
    }
  });

  const clockedIn = working + onBreak + completed;
  const notStarted = Math.max(0, totalEmployees - clockedIn);

  return {
    total: totalEmployees,
    clockedIn,
    working,
    onBreak,
    completed,
    notStarted,
    late,
  };
}

// ======== 月次サマリー ========

export async function getMonthlySummary(
  tenantId: string,
  year: number,
  month: number,
  branchId?: string
): Promise<MonthlySummary> {
  if (!db) throw new Error('Firestore not initialized');

  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

  // 打刻記録（クエリを簡素化、範囲クエリのみ）
  const entriesQuery = query(
    collection(db, 'timeEntries'),
    where('workDate', '>=', startDate),
    where('workDate', '<=', endDate)
  );

  const entriesSnapshot = await getDocs(entriesQuery);

  let totalWorkMinutes = 0;
  let totalLateNightMinutes = 0;
  let totalBreakMinutes = 0;
  const workDays = new Set<string>();

  entriesSnapshot.docs.forEach((doc) => {
    const data = doc.data();

    // クライアント側でtenantId、status、branchIdフィルタ
    if (data.tenantId !== tenantId) return;
    if (data.status !== 'completed') return;
    if (branchId && data.branchId !== branchId) return;

    totalWorkMinutes += data.totalWorkMinutes || 0;
    totalLateNightMinutes += data.lateNightMinutes || 0;
    totalBreakMinutes += data.actualBreakMinutes || 0;
    workDays.add(`${data.employeeCode}_${data.workDate}`);
  });

  // 承認済み残業（クエリを簡素化）
  const overtimeQuery = query(
    collection(db, 'overtimeRequests'),
    where('status', '==', 'approved')
  );
  const overtimeSnapshot = await getDocs(overtimeQuery);

  let totalOvertimeMinutes = 0;
  overtimeSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    // クライアント側でtenantId、日付範囲、branchIdフィルタ
    if (data.tenantId !== tenantId) return;
    if (data.workDate < startDate || data.workDate > endDate) return;
    if (branchId && data.branchId !== branchId) return;
    totalOvertimeMinutes += data.requestedMinutes || 0;
  });

  const workDayCount = workDays.size;

  return {
    totalWorkMinutes,
    totalOvertimeMinutes,
    totalLateNightMinutes,
    totalBreakMinutes,
    workDays: workDayCount,
    avgWorkMinutesPerDay: workDayCount > 0 ? Math.round(totalWorkMinutes / workDayCount) : 0,
  };
}

// ======== アラート取得 ========

export async function getAttendanceAlerts(
  tenantId: string = DEFAULT_TENANT_ID,
  branchId?: string
): Promise<AttendanceAlert[]> {
  if (!db) throw new Error('Firestore not initialized');

  const alerts: AttendanceAlert[] = [];
  const today = getTodayJST();

  // 1. 未打刻アラート（従業員で今日打刻がない人）
  // クエリを簡素化してインデックス不要に
  const employeesQuery = query(
    collection(db, 'employees'),
    where('tenantId', '==', tenantId)
  );
  const employeesSnapshot = await getDocs(employeesQuery);
  const employees = new Map<string, { name: string; branchId: string }>();
  employeesSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    // クライアント側でisActiveとbranchIdフィルタ
    if (data.isActive !== true) return;
    if (!branchId || data.branchId === branchId) {
      employees.set(data.employeeCode, {
        name: data.name,
        branchId: data.branchId,
      });
    }
  });

  // シードデータからも従業員を追加（Firestoreにデータがない場合のフォールバック）
  if (employees.size === 0) {
    EMPLOYEES_SEED.forEach((emp) => {
      if (!branchId || emp.defaultBranchId === branchId) {
        employees.set(emp.employeeCode, {
          name: emp.name,
          branchId: emp.defaultBranchId,
        });
      }
    });
  }

  // 単一フィルターに簡素化
  const entriesQuery = query(
    collection(db, 'timeEntries'),
    where('workDate', '==', today)
  );
  const entriesSnapshot = await getDocs(entriesQuery);
  const clockedInCodes = new Set<string>();
  entriesSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    // クライアント側でtenantIdフィルタ
    if (data.tenantId === tenantId) {
      clockedInCodes.add(data.employeeCode);
    }
  });

  // 10時以降で未打刻はアラート
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 10) {
    employees.forEach((emp, code) => {
      if (!clockedInCodes.has(code)) {
        alerts.push({
          id: `missing_${code}_${today}`,
          type: 'missing_clock',
          severity: 'warning',
          employeeName: emp.name,
          employeeCode: code,
          message: `${emp.name}さんが本日未打刻です`,
          date: today,
        });
      }
    });
  }

  // 2. 長時間労働アラート（12時間超）
  entriesSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (branchId && data.branchId !== branchId) return;

    const workMinutes = data.totalWorkMinutes || 0;
    if (workMinutes > 720) { // 12時間 = 720分
      const emp = employees.get(data.employeeCode);
      alerts.push({
        id: `long_hours_${data.employeeCode}_${today}`,
        type: 'long_hours',
        severity: 'error',
        employeeName: emp?.name || data.employeeCode,
        employeeCode: data.employeeCode,
        message: `${emp?.name || data.employeeCode}さんの労働時間が12時間を超えています`,
        date: today,
        value: workMinutes,
      });
    }
  });

  // 3. 残業申請待ちアラート（単一フィルターに簡素化）
  const overtimeQuery = query(
    collection(db, 'overtimeRequests'),
    where('status', '==', 'pending')
  );
  const overtimeSnapshot = await getDocs(overtimeQuery);

  overtimeSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    // クライアント側でtenantIdとbranchIdフィルタ
    if (data.tenantId !== tenantId) return;
    if (branchId && data.branchId !== branchId) return;

    alerts.push({
      id: `overtime_${doc.id}`,
      type: 'overtime_pending',
      severity: 'info',
      employeeName: data.userName,
      employeeCode: data.employeeCode,
      message: `${data.userName}さんの残業申請（${data.workDate}）が承認待ちです`,
      date: data.workDate,
      value: data.requestedMinutes,
    });
  });

  return alerts;
}

// ======== 日別勤務時間取得（グラフ用） ========

export interface DailyWorkData {
  date: string;
  workMinutes: number;
  overtimeMinutes: number;
  lateNightMinutes: number;
  headcount: number;
}

export async function getDailyWorkData(
  tenantId: string,
  year: number,
  month: number,
  branchId?: string
): Promise<DailyWorkData[]> {
  if (!db) throw new Error('Firestore not initialized');

  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

  // 打刻記録（クエリを簡素化、範囲クエリのみ）
  const entriesQuery = query(
    collection(db, 'timeEntries'),
    where('workDate', '>=', startDate),
    where('workDate', '<=', endDate)
  );

  const entriesSnapshot = await getDocs(entriesQuery);

  // 日別に集計
  const dailyMap = new Map<string, {
    workMinutes: number;
    lateNightMinutes: number;
    headcount: number;
  }>();

  entriesSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    // クライアント側でtenantId、status、branchIdフィルタ
    if (data.tenantId !== tenantId) return;
    if (data.status !== 'completed') return;
    if (branchId && data.branchId !== branchId) return;

    const date = data.workDate;
    const existing = dailyMap.get(date) || { workMinutes: 0, lateNightMinutes: 0, headcount: 0 };

    dailyMap.set(date, {
      workMinutes: existing.workMinutes + (data.totalWorkMinutes || 0),
      lateNightMinutes: existing.lateNightMinutes + (data.lateNightMinutes || 0),
      headcount: existing.headcount + 1,
    });
  });

  // 残業（承認済み）も取得（クエリを簡素化）
  const overtimeQuery = query(
    collection(db, 'overtimeRequests'),
    where('status', '==', 'approved')
  );
  const overtimeSnapshot = await getDocs(overtimeQuery);

  const overtimeMap = new Map<string, number>();
  overtimeSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    // クライアント側でtenantId、日付範囲、branchIdフィルタ
    if (data.tenantId !== tenantId) return;
    if (data.workDate < startDate || data.workDate > endDate) return;
    if (branchId && data.branchId !== branchId) return;

    const existing = overtimeMap.get(data.workDate) || 0;
    overtimeMap.set(data.workDate, existing + (data.requestedMinutes || 0));
  });

  // 結果を配列に
  const result: DailyWorkData[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const daily = dailyMap.get(date);

    result.push({
      date,
      workMinutes: daily?.workMinutes || 0,
      overtimeMinutes: overtimeMap.get(date) || 0,
      lateNightMinutes: daily?.lateNightMinutes || 0,
      headcount: daily?.headcount || 0,
    });
  }

  return result;
}

// ======== 事業所別サマリー ========

export interface BranchAttendanceSummary {
  branchId: string;
  branchName: string;
  working: number;
  onBreak: number;
  completed: number;
  notStarted: number;
  totalWorkMinutes: number;
}

export async function getBranchSummaries(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<BranchAttendanceSummary[]> {
  if (!db) throw new Error('Firestore not initialized');

  const today = getTodayJST();

  // 従業員を事業所ごとに集計（クエリを簡素化）
  const employeesQuery = query(
    collection(db, 'employees'),
    where('tenantId', '==', tenantId)
  );
  const employeesSnapshot = await getDocs(employeesQuery);

  const branchEmployees = new Map<string, Set<string>>();
  const branchNames = new Map<string, string>();

  employeesSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    // クライアント側でisActiveフィルタ
    if (data.isActive !== true) return;
    const branchId = data.branchId;

    if (!branchEmployees.has(branchId)) {
      branchEmployees.set(branchId, new Set());
    }
    branchEmployees.get(branchId)!.add(data.employeeCode);
  });

  // Firestoreにデータがない場合、シードデータからフォールバック
  if (branchEmployees.size === 0) {
    EMPLOYEES_SEED.forEach((emp) => {
      if (!branchEmployees.has(emp.defaultBranchId)) {
        branchEmployees.set(emp.defaultBranchId, new Set());
      }
      branchEmployees.get(emp.defaultBranchId)!.add(emp.employeeCode);
    });
  }

  // 事業所名を取得
  const branchesQuery = query(collection(db, 'branches'), where('tenantId', '==', tenantId));
  const branchesSnapshot = await getDocs(branchesQuery);
  branchesSnapshot.docs.forEach((doc) => {
    branchNames.set(doc.id, doc.data().name);
  });

  // シードデータから事業所名もフォールバック
  if (branchNames.size === 0) {
    BRANCHES_SEED.forEach((branch) => {
      branchNames.set(branch.id, branch.name);
    });
  }

  // 今日の打刻を取得（単一フィルターに簡素化）
  const entriesQuery = query(
    collection(db, 'timeEntries'),
    where('workDate', '==', today)
  );
  const entriesSnapshot = await getDocs(entriesQuery);

  const branchStats = new Map<string, {
    working: number;
    onBreak: number;
    completed: number;
    clockedIn: Set<string>;
    totalWorkMinutes: number;
  }>();

  entriesSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    // クライアント側でtenantIdフィルタ
    if (data.tenantId !== tenantId) return;

    const branchId = data.branchId;

    if (!branchStats.has(branchId)) {
      branchStats.set(branchId, {
        working: 0,
        onBreak: 0,
        completed: 0,
        clockedIn: new Set(),
        totalWorkMinutes: 0,
      });
    }

    const stats = branchStats.get(branchId)!;
    stats.clockedIn.add(data.employeeCode);

    if (data.status === 'working') stats.working++;
    else if (data.status === 'on_break') stats.onBreak++;
    else if (data.status === 'completed') stats.completed++;

    stats.totalWorkMinutes += data.totalWorkMinutes || 0;
  });

  // 結果をまとめる
  const result: BranchAttendanceSummary[] = [];

  branchEmployees.forEach((employees, branchId) => {
    const stats = branchStats.get(branchId);
    const clockedInCount = stats?.clockedIn.size || 0;

    result.push({
      branchId,
      branchName: branchNames.get(branchId) || branchId,
      working: stats?.working || 0,
      onBreak: stats?.onBreak || 0,
      completed: stats?.completed || 0,
      notStarted: employees.size - clockedInCount,
      totalWorkMinutes: stats?.totalWorkMinutes || 0,
    });
  });

  return result;
}
