// 勤怠・残業申請 日次突合 Cron API
// Vercel Cronで毎日09:00 (JST) に実行（前日分を突合）

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { createNotificationServer } from '@/lib/notifications-server';
import { toDate } from '@/lib/date';
import {
  executeOvertimeCheck,
  OvertimeCheckInput,
  shouldNotify,
  generateNotificationMessage,
  generateOvertimeApplicationUrl,
  calculateRequestedMinutesFromApplication,
} from '@/lib/overtime-check';
import { OvertimeCheck } from '@/types/attendance';
import { Application, OvertimePayload } from '@/types/application';
import { CreateNotificationInput, NotificationType } from '@/types/notification';
import { normalizeForFirestore } from '@/lib/firestore/normalize';

const DEFAULT_TENANT_ID = 'defaultTenant';
const OVERTIME_CHECKS_COLLECTION = 'overtimeChecks';
const TIME_ENTRIES_COLLECTION = 'timeEntries';
const APPLICATIONS_COLLECTION = 'applications';

export const dynamic = 'force-dynamic';

// Vercel Cronからのリクエストを認証
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');

  // Vercel Cron Secretによる認証
  if (process.env.CRON_SECRET) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }

  // 開発環境では認証をスキップ
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

/**
 * JSTの昨日の日付を取得（YYYY-MM-DD）
 */
function getYesterdayJST(): string {
  const now = new Date();
  // JSTオフセット (+9時間)
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jstNow.setDate(jstNow.getDate() - 1);
  const year = jstNow.getUTCFullYear();
  const month = String(jstNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstNow.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 特定日の勤怠データを取得
 */
async function getTimeEntriesForDate(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  workDate: string
): Promise<Map<string, { id: string; totalWorkMinutes: number; userId: string; branchId: string }>> {
  const snapshot = await db
    .collection(TIME_ENTRIES_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('workDate', '==', workDate)
    .where('status', '==', 'completed')
    .get();

  const entriesMap = new Map<string, { id: string; totalWorkMinutes: number; userId: string; branchId: string }>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const userId = data.userId as string;
    const totalWorkMinutes = (data.totalWorkMinutes as number) || 0;

    // 同一ユーザーで複数エントリがある場合は合算
    const existing = entriesMap.get(userId);
    if (existing) {
      existing.totalWorkMinutes += totalWorkMinutes;
    } else {
      entriesMap.set(userId, {
        id: doc.id,
        totalWorkMinutes,
        userId,
        branchId: data.branchId as string,
      });
    }
  });

  return entriesMap;
}

/**
 * 特定日の残業申請を取得（承認済みまたは申請中）
 */
async function getOvertimeApplicationsForDate(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  workDate: string
): Promise<Map<string, { id: string; requestedMinutes: number; status: string }>> {
  const snapshot = await db
    .collection(APPLICATIONS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('type', '==', 'OVERTIME')
    .get();

  const appsMap = new Map<string, { id: string; requestedMinutes: number; status: string }>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const payload = data.payload as OvertimePayload;

    // 日付が一致するもののみ
    if (payload?.date !== workDate) return;

    // 承認済みまたは申請中のみ対象
    const status = data.status as string;
    if (status !== 'approved' && status !== 'submitted') return;

    const authorId = data.authorId as string;
    const minutes = calculateRequestedMinutesFromApplication({
      payload,
    } as Application<OvertimePayload>);

    // 同一ユーザーで複数申請がある場合は合算
    const existing = appsMap.get(authorId);
    if (existing) {
      existing.requestedMinutes += minutes;
    } else {
      appsMap.set(authorId, {
        id: doc.id,
        requestedMinutes: minutes,
        status,
      });
    }
  });

  return appsMap;
}

/**
 * ユーザー情報を取得
 */
async function getUsersMap(
  db: FirebaseFirestore.Firestore,
  tenantId: string
): Promise<Map<string, { name: string; employeeCode: string; branchId: string }>> {
  const snapshot = await db
    .collection('users')
    .where('tenantId', '==', tenantId)
    .get();

  const usersMap = new Map<string, { name: string; employeeCode: string; branchId: string }>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    usersMap.set(doc.id, {
      name: (data.name as string) || 'Unknown',
      employeeCode: (data.employeeCode as string) || '',
      branchId: (data.branchId as string) || '',
    });
  });

  return usersMap;
}

/**
 * 既存の突合結果をチェック
 */
async function getExistingChecks(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  workDate: string
): Promise<Set<string>> {
  const snapshot = await db
    .collection(OVERTIME_CHECKS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('workDate', '==', workDate)
    .get();

  const userIds = new Set<string>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    userIds.add(data.userId as string);
  });

  return userIds;
}

// GET: 日次突合実行（Vercel Cronから呼び出し）
export async function GET(request: NextRequest) {
  // 認証チェック
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const targetDate = getYesterdayJST();
    console.log('[Cron] Starting overtime check for:', targetDate);

    const db = getAdminDb();
    const tenantId = DEFAULT_TENANT_ID;

    // データ取得
    const [timeEntries, overtimeApps, usersMap, existingChecks] = await Promise.all([
      getTimeEntriesForDate(db, tenantId, targetDate),
      getOvertimeApplicationsForDate(db, tenantId, targetDate),
      getUsersMap(db, tenantId),
      getExistingChecks(db, tenantId, targetDate),
    ]);

    console.log('[Cron] Data fetched:', {
      timeEntries: timeEntries.size,
      overtimeApps: overtimeApps.size,
      users: usersMap.size,
      existingChecks: existingChecks.size,
    });

    // 突合対象ユーザーを収集（勤怠があるユーザー）
    const targetUserIds = new Set<string>();
    timeEntries.forEach((_, userId) => targetUserIds.add(userId));

    // 既にチェック済みのユーザーは除外
    existingChecks.forEach((userId) => targetUserIds.delete(userId));

    const results: {
      ok: number;
      warn: number;
      ng: number;
      skipped: number;
    } = { ok: 0, warn: 0, ng: 0, skipped: 0 };

    const notifications: CreateNotificationInput[] = [];
    const checkDocs: Array<Omit<OvertimeCheck, 'id' | 'createdAt'>> = [];

    // 突合実行
    for (const userId of targetUserIds) {
      const user = usersMap.get(userId);
      if (!user) {
        results.skipped++;
        continue;
      }

      const timeEntry = timeEntries.get(userId);
      const overtimeApp = overtimeApps.get(userId);

      const input: OvertimeCheckInput = {
        userId,
        userName: user.name,
        employeeCode: user.employeeCode,
        branchId: timeEntry?.branchId || user.branchId,
        tenantId,
        workDate: targetDate,
        timeEntry: timeEntry
          ? { id: timeEntry.id, totalWorkMinutes: timeEntry.totalWorkMinutes }
          : undefined,
        overtimeApplication: overtimeApp
          ? { id: overtimeApp.id, requestedMinutes: overtimeApp.requestedMinutes, status: overtimeApp.status }
          : undefined,
      };

      const check = executeOvertimeCheck(input);
      checkDocs.push(check);

      // 結果カウント
      switch (check.status) {
        case 'OK':
          results.ok++;
          break;
        case 'WARN':
          results.warn++;
          break;
        case 'NG':
          results.ng++;
          break;
      }

      // 通知が必要な場合
      if (shouldNotify(check.status)) {
        const notifType: NotificationType = check.status === 'NG' ? 'overtime_check_ng' : 'overtime_check_warn';
        const { title, message } = generateNotificationMessage(check, check.status === 'NG' ? 'ng' : 'warn');

        notifications.push({
          tenantId,
          userId,
          type: notifType,
          title,
          message,
          actionUrl: generateOvertimeApplicationUrl(targetDate),
          metadata: {
            workDate: targetDate,
            actualOvertimeMinutes: check.actualOvertimeMinutes,
            diffMinutes: check.diffMinutes,
          },
        });
      }
    }

    // 突合結果を保存
    const batch = db.batch();
    const now = Timestamp.now();

    for (const check of checkDocs) {
      const docRef = db.collection(OVERTIME_CHECKS_COLLECTION).doc();
      batch.set(docRef, normalizeForFirestore({
        ...check,
        notified: shouldNotify(check.status),
        notifiedAt: shouldNotify(check.status) ? now : null,
        createdAt: now,
      }));
    }

    await batch.commit();
    console.log('[Cron] Check results saved:', checkDocs.length);

    // 通知を送信
    if (notifications.length > 0) {
      for (const notification of notifications) {
        await createNotificationServer(notification);
      }
      console.log('[Cron] Notifications sent:', notifications.length);
    }

    return NextResponse.json({
      success: true,
      targetDate,
      results,
      checksCreated: checkDocs.length,
      notificationsSent: notifications.length,
    });
  } catch (error) {
    console.error('[Cron] Overtime check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Check failed' },
      { status: 500 }
    );
  }
}

// POST: 手動で特定日の突合を実行（管理者用）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { date } = body as { date?: string };

    if (!date) {
      return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 });
    }

    // 日付フォーマット検証
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    console.log('[Manual] Running overtime check for:', date);

    const db = getAdminDb();
    const tenantId = DEFAULT_TENANT_ID;

    // データ取得
    const [timeEntries, overtimeApps, usersMap] = await Promise.all([
      getTimeEntriesForDate(db, tenantId, date),
      getOvertimeApplicationsForDate(db, tenantId, date),
      getUsersMap(db, tenantId),
    ]);

    // 突合対象ユーザーを収集
    const targetUserIds = new Set<string>();
    timeEntries.forEach((_, userId) => targetUserIds.add(userId));

    const checkResults: Array<{
      userId: string;
      userName: string;
      status: string;
      actualOvertimeMinutes: number;
      requestedMinutes: number;
      diffMinutes: number;
      message: string;
    }> = [];

    // 突合実行
    for (const userId of targetUserIds) {
      const user = usersMap.get(userId);
      if (!user) continue;

      const timeEntry = timeEntries.get(userId);
      const overtimeApp = overtimeApps.get(userId);

      const input: OvertimeCheckInput = {
        userId,
        userName: user.name,
        employeeCode: user.employeeCode,
        branchId: timeEntry?.branchId || user.branchId,
        tenantId,
        workDate: date,
        timeEntry: timeEntry
          ? { id: timeEntry.id, totalWorkMinutes: timeEntry.totalWorkMinutes }
          : undefined,
        overtimeApplication: overtimeApp
          ? { id: overtimeApp.id, requestedMinutes: overtimeApp.requestedMinutes, status: overtimeApp.status }
          : undefined,
      };

      const check = executeOvertimeCheck(input);
      checkResults.push({
        userId,
        userName: user.name,
        status: check.status,
        actualOvertimeMinutes: check.actualOvertimeMinutes,
        requestedMinutes: check.requestedMinutes,
        diffMinutes: check.diffMinutes,
        message: check.message,
      });
    }

    return NextResponse.json({
      success: true,
      targetDate: date,
      checksCount: checkResults.length,
      results: checkResults,
      summary: {
        ok: checkResults.filter((r) => r.status === 'OK').length,
        warn: checkResults.filter((r) => r.status === 'WARN').length,
        ng: checkResults.filter((r) => r.status === 'NG').length,
      },
    });
  } catch (error) {
    console.error('[Manual] Overtime check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Check failed' },
      { status: 500 }
    );
  }
}
