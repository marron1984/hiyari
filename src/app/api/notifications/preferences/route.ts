// ======== 通知設定API ========
// GET:  ユーザーの通知設定取得
// PUT:  ユーザーの通知設定更新

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  NotificationCategoryKey,
  NotifyMode,
  NotifyChannel,
  CategoryPreference,
} from '@/types/notification';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

const DEFAULT_TENANT_ID = 'defaultTenant';
const VALID_MODES: NotifyMode[] = ['immediate', 'digest', 'off'];
const VALID_CHANNELS: NotifyChannel[] = ['in_app', 'line_works', 'both'];

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const db = getAdminDb();
    const userId = user.uid;
    const docId = `${DEFAULT_TENANT_ID}_${userId}`;

    // 通知設定取得
    const prefDoc = await db.collection('notificationPreferences').doc(docId).get();

    // リマインダー設定も同時に取得
    const reminderDoc = await db.collection('reminderSettings').doc(docId).get();

    const preferences = prefDoc.exists
      ? { id: prefDoc.id, ...prefDoc.data() }
      : {
          id: docId,
          tenantId: DEFAULT_TENANT_ID,
          userId,
          ...DEFAULT_NOTIFICATION_PREFERENCES,
        };

    const reminderSettings = reminderDoc.exists
      ? { id: reminderDoc.id, ...reminderDoc.data() }
      : null;

    return NextResponse.json({
      success: true,
      preferences,
      reminderSettings,
    });
  } catch (error) {
    console.error('notification preferences GET error:', error);
    return NextResponse.json(
      { error: '通知設定の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const body = await request.json();
    const db = getAdminDb();
    const userId = user.uid;
    const docId = `${DEFAULT_TENANT_ID}_${userId}`;

    // バリデーション
    const updates: Record<string, unknown> = {};

    // カテゴリ別設定のバリデーション
    if (body.categories && typeof body.categories === 'object') {
      const validCategories: Partial<Record<NotificationCategoryKey, CategoryPreference>> = {};
      const categoryKeys = NOTIFICATION_CATEGORIES.map(c => c.key);

      for (const [key, value] of Object.entries(body.categories)) {
        if (!categoryKeys.includes(key as NotificationCategoryKey)) continue;

        const pref = value as Partial<CategoryPreference>;
        const categoryDef = NOTIFICATION_CATEGORIES.find(c => c.key === key);

        // モードのバリデーション
        let mode: NotifyMode = 'immediate';
        if (pref.mode && VALID_MODES.includes(pref.mode)) {
          // off不可のカテゴリはdigestに引き上げ
          if (pref.mode === 'off' && categoryDef && !categoryDef.canDisable) {
            mode = 'digest';
          } else {
            mode = pref.mode;
          }
        }

        // チャネルのバリデーション
        let channel: NotifyChannel = 'in_app';
        if (pref.channel && VALID_CHANNELS.includes(pref.channel)) {
          channel = pref.channel;
        }

        validCategories[key as NotificationCategoryKey] = { mode, channel };
      }

      updates.categories = validCategories;
    }

    // LINE WORKS全体スイッチ
    if (typeof body.lineWorksEnabled === 'boolean') {
      updates.lineWorksEnabled = body.lineWorksEnabled;
    }

    // ダイジェスト時刻（UIの選択肢に対応: 7,8,9,10,17,18,19,20）
    if (typeof body.digestHour === 'number' && Number.isInteger(body.digestHour) && body.digestHour >= 0 && body.digestHour <= 23) {
      updates.digestHour = body.digestHour;
    }

    // リマインダー設定（既存）
    if (body.reminderSettings && typeof body.reminderSettings === 'object') {
      const rs = body.reminderSettings;
      const reminderUpdates: Record<string, unknown> = {};

      // 許容される分数値（UIの選択肢に対応）
      const VALID_MINUTES = [5, 10, 15, 30, 60];

      if (typeof rs.clockInReminder === 'boolean') reminderUpdates.clockInReminder = rs.clockInReminder;
      if (typeof rs.clockInReminderMinutes === 'number' && VALID_MINUTES.includes(rs.clockInReminderMinutes)) {
        reminderUpdates.clockInReminderMinutes = rs.clockInReminderMinutes;
      }
      if (typeof rs.clockOutReminder === 'boolean') reminderUpdates.clockOutReminder = rs.clockOutReminder;
      if (typeof rs.clockOutReminderMinutes === 'number' && VALID_MINUTES.includes(rs.clockOutReminderMinutes)) {
        reminderUpdates.clockOutReminderMinutes = rs.clockOutReminderMinutes;
      }
      if (typeof rs.overtimeReminder === 'boolean') reminderUpdates.overtimeReminder = rs.overtimeReminder;
      if (typeof rs.shiftPublishedNotify === 'boolean') reminderUpdates.shiftPublishedNotify = rs.shiftPublishedNotify;
      if (typeof rs.shiftChangedNotify === 'boolean') reminderUpdates.shiftChangedNotify = rs.shiftChangedNotify;
      if (typeof rs.pushEnabled === 'boolean') reminderUpdates.pushEnabled = rs.pushEnabled;

      if (Object.keys(reminderUpdates).length > 0) {
        reminderUpdates.updatedAt = FieldValue.serverTimestamp();
        const reminderRef = db.collection('reminderSettings').doc(docId);
        const reminderSnap = await reminderRef.get();
        if (reminderSnap.exists) {
          await reminderRef.update(reminderUpdates);
        } else {
          await reminderRef.set({
            tenantId: DEFAULT_TENANT_ID,
            userId,
            clockInReminder: true,
            clockInReminderMinutes: 15,
            clockOutReminder: true,
            clockOutReminderMinutes: 30,
            overtimeReminder: true,
            shiftPublishedNotify: true,
            shiftChangedNotify: true,
            pushEnabled: false,
            ...reminderUpdates,
          });
        }
      }
    }

    // 通知設定の保存
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = FieldValue.serverTimestamp();
      const prefRef = db.collection('notificationPreferences').doc(docId);
      const prefSnap = await prefRef.get();

      if (prefSnap.exists) {
        await prefRef.update(updates);
      } else {
        await prefRef.set({
          tenantId: DEFAULT_TENANT_ID,
          userId,
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...updates,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('notification preferences PUT error:', error);
    return NextResponse.json(
      { error: '通知設定の更新に失敗しました' },
      { status: 500 }
    );
  }
}
