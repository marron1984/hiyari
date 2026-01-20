// ======== 勤怠管理 Firestore ヘルパー ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { BRANCHES_SEED } from '@/data/employees';
import {
  TimeEntry,
  WorkShift,
  OvertimeRequest,
  AttendanceAuditLog,
  PayrollExport,
  ClockStatus,
  TodayAttendanceState,
  FreeeAttendanceRow,
  MonthlyAttendanceSummary,
  ShiftImportRow,
  ShiftImportResult,
} from '@/types/attendance';
import {
  formatDateJST,
  getTodayJST,
  calculateTimeEntrySummary,
  calculateMinutesBetween,
} from './attendance-calc';

// ヘルパー: dbが初期化されているかチェック
function ensureDb() {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }
  return db;
}

// ======== 打刻記録 (TimeEntry) ========

/**
 * 今日の打刻記録を取得
 */
export async function getTodayTimeEntry(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TimeEntry | null> {
  const firestore = ensureDb();
  const today = getTodayJST();

  const q = query(
    collection(firestore, 'timeEntries'),
    where('userId', '==', userId),
    where('tenantId', '==', tenantId),
    where('workDate', '==', today),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return convertTimeEntryDoc(doc);
}

/**
 * 打刻記録を取得（ID指定）
 */
export async function getTimeEntry(entryId: string): Promise<TimeEntry | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'timeEntries', entryId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return convertTimeEntryDoc(docSnap);
}

/**
 * 出勤打刻
 */
export async function clockIn(
  userId: string,
  employeeCode: string,
  branchId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TimeEntry> {
  const firestore = ensureDb();
  const now = new Date();
  const today = getTodayJST();

  // 既に今日の打刻があるか確認
  const existing = await getTodayTimeEntry(userId, tenantId);
  if (existing && existing.clockIn) {
    throw new Error('既に出勤打刻済みです');
  }

  const newEntry: Omit<TimeEntry, 'id'> = {
    tenantId,
    branchId,
    userId,
    employeeCode,
    workDate: today,
    clockIn: now,
    status: 'working',
    isEdited: false,
    createdAt: now,
  };

  const docRef = await addDoc(collection(firestore, 'timeEntries'), {
    ...newEntry,
    clockIn: Timestamp.fromDate(now),
    createdAt: Timestamp.now(),
  });

  // 監査ログ
  await createAuditLog({
    tenantId,
    targetType: 'time_entry',
    targetId: docRef.id,
    action: 'create',
    after: { clockIn: now.toISOString() },
    editedBy: userId,
    editedByName: '',
  });

  return { id: docRef.id, ...newEntry };
}

/**
 * 退勤打刻
 */
export async function clockOut(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TimeEntry> {
  const firestore = ensureDb();
  const now = new Date();

  const existing = await getTodayTimeEntry(userId, tenantId);
  if (!existing) {
    throw new Error('出勤打刻がありません');
  }
  if (existing.clockOut) {
    throw new Error('既に退勤打刻済みです');
  }
  if (existing.status === 'on_break') {
    throw new Error('休憩中です。先に休憩終了してください');
  }

  // 休憩時間を計算
  let actualBreakMinutes = 0;
  if (existing.breakStart && existing.breakEnd) {
    actualBreakMinutes = calculateMinutesBetween(existing.breakStart, existing.breakEnd);
  }

  // 今日のシフトを取得して計算
  const shift = await getTodayShift(userId, tenantId);
  const summary = calculateTimeEntrySummary(
    { ...existing, clockOut: now, actualBreakMinutes },
    shift || undefined
  );

  const updateData = {
    clockOut: Timestamp.fromDate(now),
    actualBreakMinutes,
    totalWorkMinutes: summary.totalWorkMinutes,
    lateNightMinutes: summary.lateNightMinutes,
    status: 'completed' as ClockStatus,
    updatedAt: Timestamp.now(),
  };

  const docRef = doc(firestore, 'timeEntries', existing.id);
  await updateDoc(docRef, updateData);

  // 監査ログ
  await createAuditLog({
    tenantId,
    targetType: 'time_entry',
    targetId: existing.id,
    action: 'update',
    before: { status: existing.status },
    after: { clockOut: now.toISOString(), status: 'completed' },
    editedBy: userId,
    editedByName: '',
  });

  return {
    ...existing,
    clockOut: now,
    actualBreakMinutes,
    totalWorkMinutes: summary.totalWorkMinutes,
    lateNightMinutes: summary.lateNightMinutes,
    status: 'completed',
    updatedAt: now,
  };
}

/**
 * 休憩開始
 */
export async function breakStart(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TimeEntry> {
  const firestore = ensureDb();
  const now = new Date();

  const existing = await getTodayTimeEntry(userId, tenantId);
  if (!existing || !existing.clockIn) {
    throw new Error('出勤打刻がありません');
  }
  if (existing.clockOut) {
    throw new Error('既に退勤済みです');
  }
  if (existing.status === 'on_break') {
    throw new Error('既に休憩中です');
  }

  const updateData = {
    breakStart: Timestamp.fromDate(now),
    status: 'on_break' as ClockStatus,
    updatedAt: Timestamp.now(),
  };

  const docRef = doc(firestore, 'timeEntries', existing.id);
  await updateDoc(docRef, updateData);

  return { ...existing, breakStart: now, status: 'on_break', updatedAt: now };
}

/**
 * 休憩終了
 */
export async function breakEnd(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TimeEntry> {
  const firestore = ensureDb();
  const now = new Date();

  const existing = await getTodayTimeEntry(userId, tenantId);
  if (!existing || !existing.clockIn) {
    throw new Error('出勤打刻がありません');
  }
  if (existing.status !== 'on_break') {
    throw new Error('休憩中ではありません');
  }

  const updateData = {
    breakEnd: Timestamp.fromDate(now),
    status: 'working' as ClockStatus,
    updatedAt: Timestamp.now(),
  };

  const docRef = doc(firestore, 'timeEntries', existing.id);
  await updateDoc(docRef, updateData);

  return { ...existing, breakEnd: now, status: 'working', updatedAt: now };
}

/**
 * 勤務先拠点を変更
 */
export async function changeBranch(
  userId: string,
  newBranchId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TimeEntry> {
  const firestore = ensureDb();
  const now = new Date();

  const existing = await getTodayTimeEntry(userId, tenantId);
  if (!existing || !existing.clockIn) {
    throw new Error('出勤打刻がありません');
  }
  if (existing.clockOut) {
    throw new Error('既に退勤済みです');
  }

  const oldBranchId = existing.branchId;
  const updateData = {
    branchId: newBranchId,
    updatedAt: Timestamp.now(),
  };

  const docRef = doc(firestore, 'timeEntries', existing.id);
  await updateDoc(docRef, updateData);

  // 監査ログ
  await createAuditLog({
    tenantId,
    targetType: 'time_entry',
    targetId: existing.id,
    action: 'update',
    before: { branchId: oldBranchId },
    after: { branchId: newBranchId },
    editedBy: userId,
    editedByName: '',
  });

  return { ...existing, branchId: newBranchId, updatedAt: now };
}

/**
 * 今日の勤怠状態を取得
 */
export async function getTodayAttendanceState(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TodayAttendanceState> {
  const entry = await getTodayTimeEntry(userId, tenantId);
  const shift = await getTodayShift(userId, tenantId);

  if (!entry) {
    return {
      status: 'not_started',
      shift: shift || undefined,
    };
  }

  // 拠点名を取得
  const branch = BRANCHES_SEED.find(b => b.id === entry.branchId);

  return {
    status: entry.status,
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    breakStart: entry.breakStart,
    breakEnd: entry.breakEnd,
    totalWorkMinutes: entry.totalWorkMinutes,
    shift: shift || undefined,
    branchId: entry.branchId,
    branchName: branch?.name || entry.branchId,
  };
}

/**
 * 期間内の打刻記録を取得
 */
export async function getTimeEntriesByPeriod(
  tenantId: string,
  startDate: string,
  endDate: string,
  branchId?: string
): Promise<TimeEntry[]> {
  const firestore = ensureDb();

  let q = query(
    collection(firestore, 'timeEntries'),
    where('tenantId', '==', tenantId),
    where('workDate', '>=', startDate),
    where('workDate', '<=', endDate),
    orderBy('workDate', 'desc')
  );

  if (branchId) {
    q = query(
      collection(firestore, 'timeEntries'),
      where('tenantId', '==', tenantId),
      where('branchId', '==', branchId),
      where('workDate', '>=', startDate),
      where('workDate', '<=', endDate),
      orderBy('workDate', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertTimeEntryDoc);
}

/**
 * ユーザーの打刻記録を取得
 */
export async function getTimeEntriesByUser(
  userId: string,
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<TimeEntry[]> {
  const firestore = ensureDb();

  const q = query(
    collection(firestore, 'timeEntries'),
    where('userId', '==', userId),
    where('tenantId', '==', tenantId),
    where('workDate', '>=', startDate),
    where('workDate', '<=', endDate),
    orderBy('workDate', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertTimeEntryDoc);
}

// ======== シフト (WorkShift) ========

/**
 * 今日のシフトを取得
 */
export async function getTodayShift(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<WorkShift | null> {
  const firestore = ensureDb();
  const today = getTodayJST();

  const q = query(
    collection(firestore, 'workShifts'),
    where('userId', '==', userId),
    where('tenantId', '==', tenantId),
    where('workDate', '==', today),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  return convertShiftDoc(snapshot.docs[0]);
}

/**
 * シフトを一括登録（Excel取込用）
 */
export async function importShifts(
  shifts: ShiftImportRow[],
  userMap: Map<string, { userId: string; branchId: string }>,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<ShiftImportResult> {
  const firestore = ensureDb();
  const batch = writeBatch(firestore);
  const errors: { row: number; message: string }[] = [];
  let importedRows = 0;

  for (let i = 0; i < shifts.length; i++) {
    const shift = shifts[i];
    const userInfo = userMap.get(shift.employeeCode);

    if (!userInfo) {
      errors.push({ row: i + 1, message: `従業員コード ${shift.employeeCode} が見つかりません` });
      continue;
    }

    const docRef = doc(collection(firestore, 'workShifts'));
    const shiftData: Omit<WorkShift, 'id'> = {
      tenantId,
      branchId: userInfo.branchId,
      userId: userInfo.userId,
      employeeCode: shift.employeeCode,
      workDate: shift.workDate,
      plannedStart: shift.plannedStart,
      plannedEnd: shift.plannedEnd,
      breakMinutes: shift.breakMinutes,
      shiftType: shift.shiftType,
      source: 'excel',
      createdAt: new Date(),
    };

    batch.set(docRef, {
      ...shiftData,
      createdAt: Timestamp.now(),
    });
    importedRows++;
  }

  if (importedRows > 0) {
    await batch.commit();
  }

  return {
    success: errors.length === 0,
    totalRows: shifts.length,
    importedRows,
    errors,
  };
}

/**
 * 期間内のシフトを取得
 */
export async function getShiftsByPeriod(
  tenantId: string,
  startDate: string,
  endDate: string,
  branchId?: string
): Promise<WorkShift[]> {
  const firestore = ensureDb();

  let q = query(
    collection(firestore, 'workShifts'),
    where('tenantId', '==', tenantId),
    where('workDate', '>=', startDate),
    where('workDate', '<=', endDate),
    orderBy('workDate', 'asc')
  );

  if (branchId) {
    q = query(
      collection(firestore, 'workShifts'),
      where('tenantId', '==', tenantId),
      where('branchId', '==', branchId),
      where('workDate', '>=', startDate),
      where('workDate', '<=', endDate),
      orderBy('workDate', 'asc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertShiftDoc);
}

// ======== 残業申請 (OvertimeRequest) ========

/**
 * 残業申請を作成
 */
export async function createOvertimeRequest(
  data: Omit<OvertimeRequest, 'id' | 'status' | 'createdAt'>
): Promise<string> {
  const firestore = ensureDb();

  const docRef = await addDoc(collection(firestore, 'overtimeRequests'), {
    ...data,
    status: 'pending',
    createdAt: Timestamp.now(),
  });

  return docRef.id;
}

/**
 * 残業申請を承認
 */
export async function approveOvertimeRequest(
  requestId: string,
  approvedBy: string,
  approvedByName: string
): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'overtimeRequests', requestId);

  await updateDoc(docRef, {
    status: 'approved',
    approvedBy,
    approvedByName,
    approvedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // 対応するTimeEntryの残業時間を更新
  const request = await getOvertimeRequest(requestId);
  if (request) {
    await updateTimeEntryOvertime(
      request.userId,
      request.workDate,
      request.requestedMinutes,
      request.tenantId
    );
  }
}

/**
 * 残業申請を却下
 */
export async function rejectOvertimeRequest(
  requestId: string,
  approvedBy: string,
  approvedByName: string,
  rejectionReason: string
): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'overtimeRequests', requestId);

  await updateDoc(docRef, {
    status: 'rejected',
    approvedBy,
    approvedByName,
    approvedAt: Timestamp.now(),
    rejectionReason,
    updatedAt: Timestamp.now(),
  });
}

/**
 * 残業申請を取得
 */
export async function getOvertimeRequest(requestId: string): Promise<OvertimeRequest | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'overtimeRequests', requestId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return convertOvertimeRequestDoc(docSnap);
}

/**
 * 未承認の残業申請一覧を取得
 */
export async function getPendingOvertimeRequests(
  tenantId: string = DEFAULT_TENANT_ID,
  branchId?: string
): Promise<OvertimeRequest[]> {
  const firestore = ensureDb();

  let q = query(
    collection(firestore, 'overtimeRequests'),
    where('tenantId', '==', tenantId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );

  if (branchId) {
    q = query(
      collection(firestore, 'overtimeRequests'),
      where('tenantId', '==', tenantId),
      where('branchId', '==', branchId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertOvertimeRequestDoc);
}

/**
 * ユーザーの残業申請一覧を取得
 */
export async function getOvertimeRequestsByUser(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<OvertimeRequest[]> {
  const firestore = ensureDb();

  const q = query(
    collection(firestore, 'overtimeRequests'),
    where('userId', '==', userId),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertOvertimeRequestDoc);
}

/**
 * TimeEntryの残業時間を更新
 */
async function updateTimeEntryOvertime(
  userId: string,
  workDate: string,
  overtimeMinutes: number,
  tenantId: string
): Promise<void> {
  const firestore = ensureDb();

  const q = query(
    collection(firestore, 'timeEntries'),
    where('userId', '==', userId),
    where('tenantId', '==', tenantId),
    where('workDate', '==', workDate),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    const docRef = snapshot.docs[0].ref;
    await updateDoc(docRef, {
      overtimeMinutes,
      updatedAt: Timestamp.now(),
    });
  }
}

// ======== 管理者による打刻修正 ========

/**
 * 打刻記録を修正（管理者専用・監査ログ必須）
 */
export async function editTimeEntry(
  entryId: string,
  updates: {
    clockIn?: Date;
    clockOut?: Date;
    breakStart?: Date;
    breakEnd?: Date;
    actualBreakMinutes?: number;
  },
  editedBy: string,
  editedByName: string,
  editReason: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TimeEntry> {
  const firestore = ensureDb();

  // 既存の打刻記録を取得
  const existing = await getTimeEntry(entryId);
  if (!existing) {
    throw new Error('打刻記録が見つかりません');
  }

  // 更新データを構築
  const updateData: Record<string, unknown> = {
    isEdited: true,
    editedBy,
    editedByName,
    editedAt: Timestamp.now(),
    editReason,
    updatedAt: Timestamp.now(),
  };

  // 変更前の値を記録
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (updates.clockIn !== undefined) {
    before.clockIn = existing.clockIn?.toISOString();
    after.clockIn = updates.clockIn.toISOString();
    updateData.clockIn = Timestamp.fromDate(updates.clockIn);
  }

  if (updates.clockOut !== undefined) {
    before.clockOut = existing.clockOut?.toISOString();
    after.clockOut = updates.clockOut.toISOString();
    updateData.clockOut = Timestamp.fromDate(updates.clockOut);
  }

  if (updates.breakStart !== undefined) {
    before.breakStart = existing.breakStart?.toISOString();
    after.breakStart = updates.breakStart.toISOString();
    updateData.breakStart = Timestamp.fromDate(updates.breakStart);
  }

  if (updates.breakEnd !== undefined) {
    before.breakEnd = existing.breakEnd?.toISOString();
    after.breakEnd = updates.breakEnd.toISOString();
    updateData.breakEnd = Timestamp.fromDate(updates.breakEnd);
  }

  if (updates.actualBreakMinutes !== undefined) {
    before.actualBreakMinutes = existing.actualBreakMinutes;
    after.actualBreakMinutes = updates.actualBreakMinutes;
    updateData.actualBreakMinutes = updates.actualBreakMinutes;
  }

  // 再計算
  const updatedEntry = {
    ...existing,
    clockIn: updates.clockIn ?? existing.clockIn,
    clockOut: updates.clockOut ?? existing.clockOut,
    breakStart: updates.breakStart ?? existing.breakStart,
    breakEnd: updates.breakEnd ?? existing.breakEnd,
    actualBreakMinutes: updates.actualBreakMinutes ?? existing.actualBreakMinutes,
  };

  if (updatedEntry.clockIn && updatedEntry.clockOut) {
    const shift = await getTodayShift(existing.userId, tenantId);
    const summary = calculateTimeEntrySummary(
      updatedEntry as TimeEntry,
      shift || undefined
    );
    updateData.totalWorkMinutes = summary.totalWorkMinutes;
    updateData.lateNightMinutes = summary.lateNightMinutes;
    updateData.status = 'completed';
    after.totalWorkMinutes = summary.totalWorkMinutes;
    after.lateNightMinutes = summary.lateNightMinutes;
  }

  // 更新実行
  const docRef = doc(firestore, 'timeEntries', entryId);
  await updateDoc(docRef, updateData);

  // 監査ログ作成（必須）
  await createAuditLog({
    tenantId,
    targetType: 'time_entry',
    targetId: entryId,
    action: 'update',
    before,
    after,
    editedBy,
    editedByName,
    reason: editReason,
  });

  return {
    ...existing,
    ...updates,
    totalWorkMinutes: updateData.totalWorkMinutes as number | undefined,
    lateNightMinutes: updateData.lateNightMinutes as number | undefined,
    status: (updateData.status as ClockStatus) || existing.status,
    isEdited: true,
    editedBy,
    editedByName,
    editedAt: new Date(),
    editReason,
    updatedAt: new Date(),
  };
}

// ======== 監査ログ ========

/**
 * 監査ログを作成
 */
export async function createAuditLog(
  data: Omit<AttendanceAuditLog, 'id' | 'createdAt'>
): Promise<void> {
  const firestore = ensureDb();

  await addDoc(collection(firestore, 'attendanceAuditLogs'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

/**
 * 監査ログ一覧を取得
 */
export async function getAuditLogs(
  tenantId: string,
  options?: {
    targetType?: 'time_entry' | 'work_shift' | 'overtime_request';
    targetId?: string;
    startDate?: string;
    endDate?: string;
    limitCount?: number;
  }
): Promise<AttendanceAuditLog[]> {
  const firestore = ensureDb();

  let q = query(
    collection(firestore, 'attendanceAuditLogs'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(options?.limitCount || 100)
  );

  if (options?.targetType) {
    q = query(
      collection(firestore, 'attendanceAuditLogs'),
      where('tenantId', '==', tenantId),
      where('targetType', '==', options.targetType),
      orderBy('createdAt', 'desc'),
      limit(options?.limitCount || 100)
    );
  }

  if (options?.targetId) {
    q = query(
      collection(firestore, 'attendanceAuditLogs'),
      where('tenantId', '==', tenantId),
      where('targetId', '==', options.targetId),
      orderBy('createdAt', 'desc'),
      limit(options?.limitCount || 100)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      tenantId: data.tenantId as string,
      targetType: data.targetType as AttendanceAuditLog['targetType'],
      targetId: data.targetId as string,
      action: data.action as AttendanceAuditLog['action'],
      before: data.before as Record<string, unknown> | undefined,
      after: data.after as Record<string, unknown> | undefined,
      editedBy: data.editedBy as string,
      editedByName: data.editedByName as string,
      reason: data.reason as string | undefined,
      createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
    };
  });
}

// ======== freee CSV出力 ========

/**
 * freee形式のCSV用データを生成
 */
export async function generateFreeeCSVData(
  tenantId: string,
  startDate: string,
  endDate: string,
  branchId?: string
): Promise<FreeeAttendanceRow[]> {
  const entries = await getTimeEntriesByPeriod(tenantId, startDate, endDate, branchId);

  // 承認済み残業を取得するためのマップ
  const firestore = ensureDb();
  const overtimeQ = query(
    collection(firestore, 'overtimeRequests'),
    where('tenantId', '==', tenantId),
    where('status', '==', 'approved'),
    where('workDate', '>=', startDate),
    where('workDate', '<=', endDate)
  );
  const overtimeSnapshot = await getDocs(overtimeQ);
  const approvedOvertimeMap = new Map<string, number>();
  overtimeSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const key = `${data.userId}_${data.workDate}`;
    approvedOvertimeMap.set(key, data.requestedMinutes);
  });

  return entries
    .filter((entry) => entry.status === 'completed')
    .map((entry) => {
      const key = `${entry.userId}_${entry.workDate}`;
      const approvedOvertime = approvedOvertimeMap.get(key) || 0;

      return {
        employeeCode: entry.employeeCode,
        workDate: entry.workDate,
        workMinutes: entry.totalWorkMinutes || 0,
        overtimeMinutes: approvedOvertime, // 承認済みのみ
        lateNightMinutes: entry.lateNightMinutes || 0,
        breakMinutes: entry.actualBreakMinutes || 0,
      };
    });
}

/**
 * freee CSVを生成（UTF-8 BOM付き）
 */
export function generateFreeeCSV(rows: FreeeAttendanceRow[]): string {
  const BOM = '\uFEFF';
  const header = '従業員コード,勤務日,労働時間(分),残業時間(分),深夜時間(分),休憩時間(分)';
  const lines = rows.map(
    (row) =>
      `${row.employeeCode},${row.workDate},${row.workMinutes},${row.overtimeMinutes},${row.lateNightMinutes},${row.breakMinutes}`
  );

  return BOM + [header, ...lines].join('\n');
}

// ======== 月次サマリー ========

/**
 * 月次勤怠サマリーを生成
 */
export async function getMonthlyAttendanceSummary(
  tenantId: string,
  year: number,
  month: number,
  branchId?: string
): Promise<MonthlyAttendanceSummary[]> {
  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = `${year}-${month.toString().padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

  const entries = await getTimeEntriesByPeriod(tenantId, startDate, endDate, branchId);

  // ユーザーごとに集計
  const summaryMap = new Map<string, MonthlyAttendanceSummary>();

  for (const entry of entries) {
    const existing = summaryMap.get(entry.userId);
    if (existing) {
      existing.totalWorkDays++;
      existing.totalWorkMinutes += entry.totalWorkMinutes || 0;
      existing.totalOvertimeMinutes += entry.overtimeMinutes || 0;
      existing.totalLateNightMinutes += entry.lateNightMinutes || 0;
      existing.totalBreakMinutes += entry.actualBreakMinutes || 0;
      if (entry.status === 'missing_out') {
        existing.missingClockOutCount++;
      }
    } else {
      summaryMap.set(entry.userId, {
        userId: entry.userId,
        userName: '', // 後で補完
        employeeCode: entry.employeeCode,
        branchId: entry.branchId,
        branchName: '', // 後で補完
        totalWorkDays: 1,
        totalWorkMinutes: entry.totalWorkMinutes || 0,
        totalOvertimeMinutes: entry.overtimeMinutes || 0,
        totalLateNightMinutes: entry.lateNightMinutes || 0,
        totalBreakMinutes: entry.actualBreakMinutes || 0,
        missingClockOutCount: entry.status === 'missing_out' ? 1 : 0,
        lateCount: 0, // 別途計算
        earlyLeaveCount: 0, // 別途計算
      });
    }
  }

  return Array.from(summaryMap.values());
}

// ======== ヘルパー関数 ========

function convertTimeEntryDoc(doc: { id: string; data: () => Record<string, unknown> }): TimeEntry {
  const data = doc.data();
  return {
    id: doc.id,
    tenantId: data.tenantId as string,
    branchId: data.branchId as string,
    userId: data.userId as string,
    employeeCode: data.employeeCode as string,
    workDate: data.workDate as string,
    clockIn: data.clockIn ? (data.clockIn as Timestamp).toDate() : undefined,
    clockOut: data.clockOut ? (data.clockOut as Timestamp).toDate() : undefined,
    breakStart: data.breakStart ? (data.breakStart as Timestamp).toDate() : undefined,
    breakEnd: data.breakEnd ? (data.breakEnd as Timestamp).toDate() : undefined,
    actualBreakMinutes: data.actualBreakMinutes as number | undefined,
    totalWorkMinutes: data.totalWorkMinutes as number | undefined,
    overtimeMinutes: data.overtimeMinutes as number | undefined,
    lateNightMinutes: data.lateNightMinutes as number | undefined,
    status: data.status as ClockStatus,
    isEdited: data.isEdited as boolean,
    editedBy: data.editedBy as string | undefined,
    editedAt: data.editedAt ? (data.editedAt as Timestamp).toDate() : undefined,
    editReason: data.editReason as string | undefined,
    createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
    updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : undefined,
  };
}

function convertShiftDoc(doc: { id: string; data: () => Record<string, unknown> }): WorkShift {
  const data = doc.data();
  return {
    id: doc.id,
    tenantId: data.tenantId as string,
    branchId: data.branchId as string,
    userId: data.userId as string,
    employeeCode: data.employeeCode as string,
    workDate: data.workDate as string,
    plannedStart: data.plannedStart as string,
    plannedEnd: data.plannedEnd as string,
    breakMinutes: data.breakMinutes as number,
    shiftType: data.shiftType as WorkShift['shiftType'],
    source: data.source as WorkShift['source'],
    aiGenerationMeta: data.aiGenerationMeta as WorkShift['aiGenerationMeta'],
    confidenceScore: data.confidenceScore as number | undefined,
    createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
    updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : undefined,
  };
}

function convertOvertimeRequestDoc(doc: { id: string; data: () => Record<string, unknown> }): OvertimeRequest {
  const data = doc.data();
  return {
    id: doc.id,
    tenantId: data.tenantId as string,
    branchId: data.branchId as string,
    userId: data.userId as string,
    userName: data.userName as string,
    employeeCode: data.employeeCode as string,
    workDate: data.workDate as string,
    requestedMinutes: data.requestedMinutes as number,
    reason: data.reason as string,
    status: data.status as OvertimeRequest['status'],
    approvedBy: data.approvedBy as string | undefined,
    approvedByName: data.approvedByName as string | undefined,
    approvedAt: data.approvedAt ? (data.approvedAt as Timestamp).toDate() : undefined,
    rejectionReason: data.rejectionReason as string | undefined,
    createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
    updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : undefined,
  };
}
