// 勤怠・残業申請 夜間バッチ突合 Cron API
// Vercel Cronで毎日 JST 02:00 に自動実行（前日分を突合）

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { createNotificationServer, createNotificationsServer } from '@/lib/notifications-server';
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

// ロール階層
const ROLE_HIERARCHY = ['user', 'leader', 'manager', 'admin', 'exec', 'owner'];

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
 * ユーザー情報を取得（ロール情報含む）
 */
async function getUsersMap(
  db: FirebaseFirestore.Firestore,
  tenantId: string
): Promise<Map<string, { name: string; employeeCode: string; branchId: string; role: string }>> {
  const snapshot = await db
    .collection('users')
    .where('tenantId', '==', tenantId)
    .get();

  const usersMap = new Map<string, { name: string; employeeCode: string; branchId: string; role: string }>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    usersMap.set(doc.id, {
      name: (data.name as string) || 'Unknown',
      employeeCode: (data.employeeCode as string) || '',
      branchId: (data.branchId as string) || '',
      role: (data.role as string) || 'user',
    });
  });

  return usersMap;
}

/**
 * 事業所のmanager以上を取得
 */
function getManagersForBranch(
  usersMap: Map<string, { name: string; employeeCode: string; branchId: string; role: string }>,
  branchId: string,
  tenantId: string
): Array<{ id: string; name: string }> {
  const managerRoleIndex = ROLE_HIERARCHY.indexOf('manager');
  const managers: Array<{ id: string; name: string }> = [];

  usersMap.forEach((user, id) => {
    const userRoleIndex = ROLE_HIERARCHY.indexOf(user.role);

    // manager以上
    if (userRoleIndex >= managerRoleIndex) {
      // admin以上は全事業所対応、それ以外は同一事業所のみ
      if (userRoleIndex >= ROLE_HIERARCHY.indexOf('admin') || user.branchId === branchId) {
        managers.push({ id, name: user.name });
      }
    }
  });

  return managers;
}

/**
 * 既存の突合結果をチェック（二重生成防止）
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

/**
 * 既存の通知をチェック（二重通知防止）
 */
async function getExistingNotifications(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  workDate: string
): Promise<Set<string>> {
  const snapshot = await db
    .collection('notifications')
    .where('tenantId', '==', tenantId)
    .where('metadata.workDate', '==', workDate)
    .get();

  // userId_type をキーとして保存
  const notifiedKeys = new Set<string>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const userId = data.userId as string;
    const type = data.type as string;
    if (type === 'overtime_check_ng' || type === 'overtime_check_warn') {
      notifiedKeys.add(`${userId}_${type}`);
    }
  });

  return notifiedKeys;
}

// GET: 夜間バッチ実行（Vercel Cronから呼び出し）
export async function GET(request: NextRequest) {
  // 認証チェック
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const targetDate = getYesterdayJST();
    console.log('[NightBatch] Starting overtime check for:', targetDate);

    const db = getAdminDb();
    const tenantId = DEFAULT_TENANT_ID;

    // データ取得
    const [timeEntries, overtimeApps, usersMap, existingChecks, existingNotifications] = await Promise.all([
      getTimeEntriesForDate(db, tenantId, targetDate),
      getOvertimeApplicationsForDate(db, tenantId, targetDate),
      getUsersMap(db, tenantId),
      getExistingChecks(db, tenantId, targetDate),
      getExistingNotifications(db, tenantId, targetDate),
    ]);

    console.log('[NightBatch] Data fetched:', {
      timeEntries: timeEntries.size,
      overtimeApps: overtimeApps.size,
      users: usersMap.size,
      existingChecks: existingChecks.size,
      existingNotifications: existingNotifications.size,
    });

    // 突合対象ユーザーを収集（勤怠があるユーザー）
    const targetUserIds = new Set<string>();
    timeEntries.forEach((_, userId) => targetUserIds.add(userId));

    // 既にチェック済みのユーザーは除外（二重生成防止）
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

        // 本人への通知（二重通知チェック）
        const userNotifKey = `${userId}_${notifType}`;
        if (!existingNotifications.has(userNotifKey)) {
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

        // NGの場合はmanagerにも通知
        if (check.status === 'NG') {
          const branchId = timeEntry?.branchId || user.branchId;
          const managers = getManagersForBranch(usersMap, branchId, tenantId);

          for (const manager of managers) {
            // 本人は除外
            if (manager.id === userId) continue;

            // 二重通知チェック
            const managerNotifKey = `${manager.id}_${notifType}`;
            if (existingNotifications.has(managerNotifKey)) continue;

            const managerMessage = `${user.name}さんの${message}`;
            notifications.push({
              tenantId,
              userId: manager.id,
              type: notifType,
              title: `【部下】${title}`,
              message: managerMessage,
              actionUrl: '/dashboard/admin/overtime-checks',
              metadata: {
                workDate: targetDate,
                actualOvertimeMinutes: check.actualOvertimeMinutes,
                diffMinutes: check.diffMinutes,
              },
            });
          }
        }
      }
    }

    // 突合結果を保存
    if (checkDocs.length > 0) {
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
      console.log('[NightBatch] Check results saved:', checkDocs.length);
    }

    // 通知を送信
    if (notifications.length > 0) {
      await createNotificationsServer(notifications);
      console.log('[NightBatch] Notifications sent:', notifications.length);
    }

    return NextResponse.json({
      success: true,
      targetDate,
      results,
      checksCreated: checkDocs.length,
      notificationsSent: notifications.length,
    });
  } catch (error) {
    console.error('[NightBatch] Overtime check error:', error);
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
    const { date, saveResults = false, sendNotifications = false } = body as {
      date?: string;
      saveResults?: boolean;
      sendNotifications?: boolean;
    };

    if (!date) {
      return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 });
    }

    // 日付フォーマット検証
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    console.log('[Manual] Running overtime check for:', date, { saveResults, sendNotifications });

    const db = getAdminDb();
    const tenantId = DEFAULT_TENANT_ID;

    // データ取得
    const [timeEntries, overtimeApps, usersMap, existingChecks] = await Promise.all([
      getTimeEntriesForDate(db, tenantId, date),
      getOvertimeApplicationsForDate(db, tenantId, date),
      getUsersMap(db, tenantId),
      getExistingChecks(db, tenantId, date),
    ]);

    // 突合対象ユーザーを収集
    const targetUserIds = new Set<string>();
    timeEntries.forEach((_, userId) => targetUserIds.add(userId));

    // 既存チェックを除外（saveResults=trueの場合のみ）
    if (saveResults) {
      existingChecks.forEach((userId) => targetUserIds.delete(userId));
    }

    const checkResults: Array<{
      userId: string;
      userName: string;
      branchId: string;
      status: string;
      actualOvertimeMinutes: number;
      requestedMinutes: number;
      diffMinutes: number;
      message: string;
    }> = [];

    const checkDocs: Array<Omit<OvertimeCheck, 'id' | 'createdAt'>> = [];
    const notifications: CreateNotificationInput[] = [];

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
        branchId: check.branchId,
        status: check.status,
        actualOvertimeMinutes: check.actualOvertimeMinutes,
        requestedMinutes: check.requestedMinutes,
        diffMinutes: check.diffMinutes,
        message: check.message,
      });

      if (saveResults) {
        checkDocs.push(check);
      }

      // 通知準備
      if (sendNotifications && shouldNotify(check.status)) {
        const notifType: NotificationType = check.status === 'NG' ? 'overtime_check_ng' : 'overtime_check_warn';
        const { title, message } = generateNotificationMessage(check, check.status === 'NG' ? 'ng' : 'warn');

        notifications.push({
          tenantId,
          userId,
          type: notifType,
          title,
          message,
          actionUrl: generateOvertimeApplicationUrl(date),
          metadata: {
            workDate: date,
            actualOvertimeMinutes: check.actualOvertimeMinutes,
            diffMinutes: check.diffMinutes,
          },
        });

        // NGの場合はmanagerにも通知
        if (check.status === 'NG') {
          const branchId = timeEntry?.branchId || user.branchId;
          const managers = getManagersForBranch(usersMap, branchId, tenantId);

          for (const manager of managers) {
            if (manager.id === userId) continue;

            const managerMessage = `${user.name}さんの${message}`;
            notifications.push({
              tenantId,
              userId: manager.id,
              type: notifType,
              title: `【部下】${title}`,
              message: managerMessage,
              actionUrl: '/dashboard/admin/overtime-checks',
              metadata: {
                workDate: date,
                actualOvertimeMinutes: check.actualOvertimeMinutes,
                diffMinutes: check.diffMinutes,
              },
            });
          }
        }
      }
    }

    // 結果を保存
    if (saveResults && checkDocs.length > 0) {
      const batch = db.batch();
      const now = Timestamp.now();

      for (const check of checkDocs) {
        const docRef = db.collection(OVERTIME_CHECKS_COLLECTION).doc();
        batch.set(docRef, normalizeForFirestore({
          ...check,
          notified: sendNotifications && shouldNotify(check.status),
          notifiedAt: sendNotifications && shouldNotify(check.status) ? now : null,
          createdAt: now,
        }));
      }

      await batch.commit();
    }

    // 通知を送信
    if (sendNotifications && notifications.length > 0) {
      await createNotificationsServer(notifications);
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
      saved: saveResults ? checkDocs.length : 0,
      notificationsSent: sendNotifications ? notifications.length : 0,
    });
  } catch (error) {
    console.error('[Manual] Overtime check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Check failed' },
      { status: 500 }
    );
  }
}
