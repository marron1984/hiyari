/**
 * 通知タイプ
 *
 * Task 038: 未分類アラート type 名の統一
 * - 正式名称: business_scope_unclassified
 * - レガシー名: unclassified_scope（後方互換）
 */
export type NotificationType =
  | 'clock_reminder'        // 打刻リマインダー
  | 'overtime_request'      // 残業申請通知
  | 'overtime_approved'     // 残業申請承認
  | 'overtime_rejected'     // 残業申請却下
  | 'shift_published'       // シフト公開
  | 'shift_changed'         // シフト変更
  | 'missing_clock'         // 打刻漏れ警告
  | 'long_hours_warning'    // 長時間労働警告
  | 'incident_submitted'    // ヒヤリハット投稿
  | 'incident_commented'    // コメント通知
  | 'approval_pending'      // 承認待ち（承認者向け）
  | 'application_approved'  // 申請承認（申請者向け）
  | 'application_rejected'  // 申請却下（申請者向け）
  | 'application_returned'  // 申請差戻し（申請者向け）
  | 'payment_completed'     // 支払い完了（申請者向け）
  | 'payment_failed'        // 支払い失敗（申請者・管理者向け）
  | 'ai_anomaly_report'     // AI副社長・日次違和感レポート
  | 'ai_organization_health' // AI副社長・組織温度レポート
  | 'ai_todo_high'          // AI副社長・HIGH優先度TODO
  | 'ai_vp_ticket_created'  // Task 043: AI副社長・チケット自動生成
  | 'business_scope_unclassified'  // Task 038: 未分類スコープ警告（正式名称）
  | 'unclassified_scope'    // Task 033: 未分類スコープ警告（レガシー）
  | 'mbr_action_created'    // Ticket 128: MBR改善タスク自動起票
  | 'mbr_action_overdue'    // Ticket 130: MBR改善タスク期限超過
  | 'vacancy_inquiry'       // 空室問い合わせ通知
  | 'vacancy_inquiry_sla_breach'   // Ticket 071: 空室問い合わせSLA超過
  | 'vacancy_unit_updated'         // Ticket 075: 空室ユニット更新
  | 'vacancy_suggestion_created'   // Ticket 075: 空室更新提案
  | 'system';               // システム通知

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
    // application (approval_pending, application_approved, etc.)
    applicationId?: string;
    applicationType?: 'RINGI' | 'EXPENSE' | 'OVERTIME' | 'PAYMENT_REQUEST';
    reason?: string;
    // payment (payment_completed, payment_failed)
    paymentId?: string;
    paymentAmount?: number;
    payeeName?: string;
    errorMessage?: string;
    // ai_anomaly_report
    reportId?: string;
    reportDate?: string;
    alertLevel?: 'normal' | 'attention' | 'warning' | 'priority';
    // ai_todo_high
    todoId?: string;
    todoSource?: 'OVERTIME' | 'APPROVAL' | 'SALES' | 'DOCUMENT' | 'PROSPECT';
    // unclassified_scope (Task 033)
    unclassifiedCounts?: {
      tickets: number;
      repairs: number;
      correctiveActions: number;
      total: number;
    };
    targetRole?: 'admin' | 'manager' | 'leader' | string;
    detectedAt?: string;
    // ai_vp_ticket_created (Task 043)
    ticketId?: string;
    businessUnitId?: string;
    fingerprint?: string;
    // vacancy_inquiry_sla_breach (Ticket 071)
    slaDueAt?: string;
    hoursOverdue?: number;
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

// ===================
// 通知設定（詳細化）
// ===================

/** 通知モード */
export type NotifyMode = 'immediate' | 'digest' | 'off';

/** 通知チャネル */
export type NotifyChannel = 'in_app' | 'line_works' | 'both';

/** 通知カテゴリキー */
export type NotificationCategoryKey =
  | 'attendance'    // 勤怠（打刻・打刻漏れ・長時間）
  | 'overtime'      // 残業申請
  | 'shift'         // シフト
  | 'approval'      // 申請・承認
  | 'incident'      // ヒヤリハット
  | 'payment'       // 支払い
  | 'ai_vp'         // AI副社長
  | 'vacancy'       // 入居・空室
  | 'mbr'           // MBR改善
  | 'system';       // システム

/** カテゴリ → 通知タイプのマッピング */
export const CATEGORY_TYPE_MAP: Record<NotificationCategoryKey, NotificationType[]> = {
  attendance: ['clock_reminder', 'missing_clock', 'long_hours_warning'],
  overtime: ['overtime_request', 'overtime_approved', 'overtime_rejected'],
  shift: ['shift_published', 'shift_changed'],
  approval: ['approval_pending', 'application_approved', 'application_rejected', 'application_returned'],
  incident: ['incident_submitted', 'incident_commented'],
  payment: ['payment_completed', 'payment_failed'],
  ai_vp: ['ai_anomaly_report', 'ai_organization_health', 'ai_todo_high', 'ai_vp_ticket_created'],
  vacancy: ['vacancy_inquiry', 'vacancy_inquiry_sla_breach', 'vacancy_unit_updated', 'vacancy_suggestion_created'],
  mbr: ['mbr_action_created', 'mbr_action_overdue'],
  system: ['system', 'business_scope_unclassified', 'unclassified_scope'],
};

/** カテゴリ定義（UI表示用） */
export interface NotificationCategoryDef {
  key: NotificationCategoryKey;
  label: string;
  description: string;
  icon: string; // lucide icon name
  color: string; // tailwind color
  canDisable: boolean; // offにできるか
}

export const NOTIFICATION_CATEGORIES: NotificationCategoryDef[] = [
  { key: 'attendance', label: '勤怠', description: '打刻リマインダー・打刻漏れ・長時間労働', icon: 'Clock', color: 'blue', canDisable: true },
  { key: 'overtime', label: '残業申請', description: '残業申請の承認・却下通知', icon: 'FileText', color: 'amber', canDisable: true },
  { key: 'shift', label: 'シフト', description: 'シフト公開・変更通知', icon: 'Calendar', color: 'purple', canDisable: true },
  { key: 'approval', label: '申請・承認', description: '稟議・経費の承認待ち・結果通知', icon: 'CheckCircle', color: 'green', canDisable: true },
  { key: 'incident', label: 'ヒヤリハット', description: 'インシデント投稿・コメント通知', icon: 'AlertTriangle', color: 'orange', canDisable: true },
  { key: 'payment', label: '支払い', description: '振込完了・失敗通知', icon: 'CreditCard', color: 'emerald', canDisable: false },
  { key: 'ai_vp', label: 'AI副社長', description: '違和感レポート・TODO・チケット生成', icon: 'Brain', color: 'indigo', canDisable: true },
  { key: 'vacancy', label: '入居・空室', description: '問い合わせ・SLA超過・空室更新', icon: 'Building', color: 'teal', canDisable: true },
  { key: 'mbr', label: 'MBR改善', description: '改善タスク起票・期限超過', icon: 'Target', color: 'rose', canDisable: true },
  { key: 'system', label: 'システム', description: 'システムエラー・重要アラート', icon: 'Shield', color: 'red', canDisable: false },
];

/** カテゴリ別の通知設定 */
export interface CategoryPreference {
  mode: NotifyMode;
  channel: NotifyChannel;
}

/** ユーザー通知設定 */
export interface NotificationPreferences {
  id: string;
  tenantId: string;
  userId: string;
  /** カテゴリ別設定 */
  categories: Partial<Record<NotificationCategoryKey, CategoryPreference>>;
  /** LINE WORKS通知の全体スイッチ */
  lineWorksEnabled: boolean;
  /** ダイジェスト送信時刻（JST 0-23） */
  digestHour: number;
  updatedAt: Date;
}

/** デフォルト設定 */
export const DEFAULT_CATEGORY_PREFERENCE: CategoryPreference = {
  mode: 'immediate',
  channel: 'in_app',
};

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferences, 'id' | 'tenantId' | 'userId' | 'updatedAt'> = {
  categories: {},
  lineWorksEnabled: false,
  digestHour: 9,
};

/** 通知タイプからカテゴリを逆引き */
export function getCategoryForType(type: NotificationType): NotificationCategoryKey | null {
  for (const [key, types] of Object.entries(CATEGORY_TYPE_MAP)) {
    if (types.includes(type)) return key as NotificationCategoryKey;
  }
  return null;
}
