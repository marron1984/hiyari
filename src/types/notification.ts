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
  | 'vacancy_inquiry_sla_breach'   // Ticket 071: 空室問い合わせSLA超過
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
