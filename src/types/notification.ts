// 通知タイプ
export type NotificationType =
  | 'clock_reminder'      // 打刻リマインダー
  | 'overtime_request'    // 残業申請通知
  | 'overtime_approved'   // 残業申請承認
  | 'overtime_rejected'   // 残業申請却下
  | 'shift_published'     // シフト公開
  | 'shift_changed'       // シフト変更
  | 'missing_clock'       // 打刻漏れ警告
  | 'long_hours_warning'  // 長時間労働警告
  | 'incident_submitted'  // ヒヤリハット投稿
  | 'incident_commented'  // コメント通知
  | 'system';             // システム通知

// 通知
export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  readAt?: Date;
  // 関連リンク
  actionUrl?: string;
  // メタデータ (type別の追加情報)
  metadata?: {
    // clock_reminder
    shiftId?: string;
    scheduledTime?: string;
    // overtime_request / approved / rejected
    overtimeRequestId?: string;
    requestedMinutes?: number;
    // shift
    shiftDate?: string;
    // incident
    incidentId?: string;
  };
}

// リマインダー設定
export interface ReminderSettings {
  id: string;
  tenantId: string;
  userId: string;
  // 打刻リマインダー
  clockInReminder: boolean;
  clockInReminderMinutes: number; // シフト開始の何分前
  clockOutReminder: boolean;
  clockOutReminderMinutes: number; // シフト終了の何分後
  // 残業申請リマインダー
  overtimeReminder: boolean;
  // シフト通知
  shiftPublishedNotify: boolean;
  shiftChangedNotify: boolean;
  // プッシュ通知
  pushEnabled: boolean;
  // 更新日時
  updatedAt: Date;
}

// デフォルトのリマインダー設定
export const DEFAULT_REMINDER_SETTINGS: Omit<ReminderSettings, 'id' | 'tenantId' | 'userId' | 'updatedAt'> = {
  clockInReminder: true,
  clockInReminderMinutes: 15,
  clockOutReminder: true,
  clockOutReminderMinutes: 30,
  overtimeReminder: true,
  shiftPublishedNotify: true,
  shiftChangedNotify: true,
  pushEnabled: false,
};

// 通知作成用の入力型
export interface CreateNotificationInput {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Notification['metadata'];
}
