import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Notification,
  ReminderSettings,
  CreateNotificationInput,
  DEFAULT_REMINDER_SETTINGS,
} from '@/types/notification';

// Firestore初期化チェック
function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ===================
// 通知 CRUD
// ===================

// 通知作成
export async function createNotification(input: CreateNotificationInput): Promise<string> {
  const notificationRef = collection(getDb(), 'notifications');
  const docRef = await addDoc(notificationRef, {
    ...input,
    read: false,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

// 複数通知を一括作成
export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  const firestore = getDb();
  const batch = writeBatch(firestore);
  inputs.forEach((input) => {
    const docRef = doc(collection(firestore, 'notifications'));
    batch.set(docRef, {
      ...input,
      read: false,
      createdAt: Timestamp.now(),
    });
  });
  await batch.commit();
}

// ユーザーの通知一覧取得
export async function getUserNotifications(
  userId: string,
  limitCount: number = 50
): Promise<Notification[]> {
  const q = query(
    collection(getDb(), 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate(),
    readAt: d.data().readAt?.toDate(),
  })) as Notification[];
}

// 未読通知数取得
export async function getUnreadCount(userId: string): Promise<number> {
  const q = query(
    collection(getDb(), 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );

  const snapshot = await getDocs(q);
  return snapshot.size;
}

// 通知を既読にする
export async function markAsRead(notificationId: string): Promise<void> {
  const docRef = doc(getDb(), 'notifications', notificationId);
  await updateDoc(docRef, {
    read: true,
    readAt: Timestamp.now(),
  });
}

// 全通知を既読にする
export async function markAllAsRead(userId: string): Promise<void> {
  const firestore = getDb();
  const q = query(
    collection(firestore, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );

  const snapshot = await getDocs(q);
  const batch = writeBatch(firestore);

  snapshot.docs.forEach((d) => {
    batch.update(d.ref, {
      read: true,
      readAt: Timestamp.now(),
    });
  });

  await batch.commit();
}

// 通知のリアルタイム購読
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void,
  limitCount: number = 20
): () => void {
  const q = query(
    collection(getDb(), 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate(),
      readAt: d.data().readAt?.toDate(),
    })) as Notification[];
    callback(notifications);
  });
}

// 未読数のリアルタイム購読
export function subscribeToUnreadCount(
  userId: string,
  callback: (count: number) => void
): () => void {
  const q = query(
    collection(getDb(), 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.size);
  });
}

// ===================
// リマインダー設定
// ===================

// リマインダー設定取得
export async function getReminderSettings(
  tenantId: string,
  userId: string
): Promise<ReminderSettings | null> {
  const docRef = doc(getDb(), 'reminderSettings', `${tenantId}_${userId}`);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
    updatedAt: docSnap.data().updatedAt?.toDate(),
  } as ReminderSettings;
}

// リマインダー設定を取得または作成
export async function getOrCreateReminderSettings(
  tenantId: string,
  userId: string
): Promise<ReminderSettings> {
  const existing = await getReminderSettings(tenantId, userId);
  if (existing) return existing;

  const id = `${tenantId}_${userId}`;
  const settings: ReminderSettings = {
    id,
    tenantId,
    userId,
    ...DEFAULT_REMINDER_SETTINGS,
    updatedAt: new Date(),
  };

  await setDoc(doc(getDb(), 'reminderSettings', id), {
    ...settings,
    updatedAt: Timestamp.now(),
  });

  return settings;
}

// リマインダー設定更新
export async function updateReminderSettings(
  tenantId: string,
  userId: string,
  updates: Partial<Omit<ReminderSettings, 'id' | 'tenantId' | 'userId' | 'updatedAt'>>
): Promise<void> {
  const docRef = doc(getDb(), 'reminderSettings', `${tenantId}_${userId}`);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

// ===================
// 通知生成ヘルパー
// ===================

// 打刻リマインダー通知
export function createClockInReminderNotification(
  tenantId: string,
  userId: string,
  scheduledTime: string
): CreateNotificationInput {
  return {
    tenantId,
    userId,
    type: 'clock_reminder',
    title: '出勤時間のお知らせ',
    message: `まもなく出勤時間です（${scheduledTime}）`,
    actionUrl: '/attendance',
    metadata: { scheduledTime },
  };
}

export function createClockOutReminderNotification(
  tenantId: string,
  userId: string,
  scheduledTime: string
): CreateNotificationInput {
  return {
    tenantId,
    userId,
    type: 'clock_reminder',
    title: '退勤確認',
    message: `シフト終了時間を過ぎています。退勤打刻をお忘れなく`,
    actionUrl: '/attendance',
    metadata: { scheduledTime },
  };
}

// 残業申請通知
export function createOvertimeRequestNotification(
  tenantId: string,
  adminUserId: string,
  requesterName: string,
  requestedMinutes: number,
  overtimeRequestId: string
): CreateNotificationInput {
  const hours = Math.floor(requestedMinutes / 60);
  const mins = requestedMinutes % 60;
  const timeStr = hours > 0 ? `${hours}時間${mins > 0 ? `${mins}分` : ''}` : `${mins}分`;

  return {
    tenantId,
    userId: adminUserId,
    type: 'overtime_request',
    title: '残業申請',
    message: `${requesterName}さんから${timeStr}の残業申請があります`,
    actionUrl: '/admin/attendance?tab=overtime',
    metadata: { overtimeRequestId, requestedMinutes },
  };
}

export function createOvertimeApprovedNotification(
  tenantId: string,
  userId: string,
  requestedMinutes: number,
  overtimeRequestId: string
): CreateNotificationInput {
  return {
    tenantId,
    userId,
    type: 'overtime_approved',
    title: '残業申請承認',
    message: '残業申請が承認されました',
    actionUrl: '/attendance/overtime',
    metadata: { overtimeRequestId, requestedMinutes },
  };
}

export function createOvertimeRejectedNotification(
  tenantId: string,
  userId: string,
  overtimeRequestId: string
): CreateNotificationInput {
  return {
    tenantId,
    userId,
    type: 'overtime_rejected',
    title: '残業申請却下',
    message: '残業申請が却下されました。詳細を確認してください',
    actionUrl: '/attendance/overtime',
    metadata: { overtimeRequestId },
  };
}

// 打刻漏れ警告
export function createMissingClockNotification(
  tenantId: string,
  userId: string,
  date: string
): CreateNotificationInput {
  return {
    tenantId,
    userId,
    type: 'missing_clock',
    title: '打刻漏れ',
    message: `${date}の打刻が完了していません。確認してください`,
    actionUrl: '/attendance/history',
    metadata: { shiftDate: date },
  };
}

// 長時間労働警告
export function createLongHoursWarningNotification(
  tenantId: string,
  userId: string,
  hours: number
): CreateNotificationInput {
  return {
    tenantId,
    userId,
    type: 'long_hours_warning',
    title: '長時間労働',
    message: `本日の労働時間が${hours}時間を超えています。休憩を取りましょう`,
    actionUrl: '/attendance',
  };
}

// シフト公開通知
export function createShiftPublishedNotification(
  tenantId: string,
  userId: string,
  periodStart: string,
  periodEnd: string
): CreateNotificationInput {
  return {
    tenantId,
    userId,
    type: 'shift_published',
    title: 'シフト公開',
    message: `${periodStart}〜${periodEnd}のシフトが公開されました`,
    actionUrl: '/attendance',
  };
}
