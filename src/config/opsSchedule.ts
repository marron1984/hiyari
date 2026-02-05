/**
 * Ops スケジュール設定
 *
 * Implementation Ticket 067: daily-ops / weekly-ops の本番運用固定
 *
 * 方針:
 * - daily-ops: 毎日 08:30 実行
 * - notify-digest: 毎日 09:00 実行
 * - weekly-ops: 毎週 月曜 08:00 実行
 */

// ========== スケジュール定数 ==========

/**
 * 日次オペレーション実行スケジュール
 */
export const DAILY_OPS_SCHEDULE = {
  /** 実行時刻（時） */
  hour: 8,
  /** 実行時刻（分） */
  minute: 30,
  /** Cron式 */
  cron: '30 8 * * *',
  /** 説明 */
  description: '毎日 08:30 JST',
} as const;

/**
 * 朝ダイジェスト通知スケジュール
 */
export const NOTIFY_DIGEST_SCHEDULE = {
  /** 実行時刻（時） */
  hour: 9,
  /** 実行時刻（分） */
  minute: 0,
  /** Cron式 */
  cron: '0 9 * * *',
  /** 説明 */
  description: '毎日 09:00 JST',
} as const;

/**
 * 週次オペレーション実行スケジュール
 */
export const WEEKLY_OPS_SCHEDULE = {
  /** 実行曜日（0=日曜, 1=月曜, ..., 6=土曜） */
  dayOfWeek: 1,
  /** 実行時刻（時） */
  hour: 8,
  /** 実行時刻（分） */
  minute: 0,
  /** Cron式 */
  cron: '0 8 * * 1',
  /** 説明 */
  description: '毎週月曜 08:00 JST',
} as const;

// ========== 再通知抑制（Throttle）設定 ==========

/**
 * アラートタイプ別の再通知抑制時間（分）
 *
 * Ticket 055/061 で実装済み、ここで最終確定値を明示
 */
export const THROTTLE_MINUTES = {
  /** システムエラー: 30分 */
  system_error: 30,
  /** 未分類スコープ: 120分（2時間） */
  business_scope_unclassified: 120,
  /** KPI異常（critical）: 60分 */
  kpi_anomaly: 60,
  /** その他warning/ダイジェスト: 1440分（24時間） */
  default_digest: 1440,
} as const;

// ========== ダイジェスト内容 ==========

/**
 * 朝イチダイジェストに含める項目
 *
 * Ticket 067: ダイジェストの内容固定
 */
export const MORNING_DIGEST_ITEMS = {
  /** critical open アラート */
  criticalOpen: true,
  /** system_error open アラート */
  systemErrorOpen: true,
  /** unclassified open アラート */
  unclassifiedOpen: true,
  /** 期限超過（licenses/contracts/agreements） */
  deadlineOverdue: true,
  /** 未割当（unassigned_item） */
  unassignedItems: true,
  /** 今日のTop3への導線（AI副社長 Ticket 059） */
  aiVpTop3Link: true,
} as const;

/**
 * ダイジェスト対象アラートタイプ
 */
export const DIGEST_ALERT_TYPES = [
  'system_error',
  'business_scope_unclassified',
  'kpi_anomaly',
  'deadline_overdue',
  'agreement_risk',
  'ticket_backlog',
  'training_overdue',
  'receivable_risk',
  'collection_flow_risk',
] as const;

// ========== 失敗時の復旧導線設定 ==========

/**
 * Ops失敗時の通知設定
 */
export const OPS_FAILURE_NOTIFICATION = {
  /** 通知対象ロール */
  targetRoles: ['manager', 'admin'] as const,
  /** 通知モード（即時） */
  mode: 'immediate' as const,
  /** 再通知抑制時間（分）- システムエラーと同じ */
  throttleMinutes: 30,
} as const;

// ========== ユーティリティ ==========

/**
 * 現在時刻がスケジュールされた時刻かどうかを判定
 */
export function isScheduledTime(
  schedule: { hour: number; minute: number; dayOfWeek?: number },
  now: Date = new Date()
): boolean {
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDay = now.getDay();

  // 曜日チェック（指定されている場合）
  if (schedule.dayOfWeek !== undefined && currentDay !== schedule.dayOfWeek) {
    return false;
  }

  // 時刻チェック（±5分の誤差を許容）
  const scheduledMinutes = schedule.hour * 60 + schedule.minute;
  const currentMinutes = currentHour * 60 + currentMinute;
  const diff = Math.abs(scheduledMinutes - currentMinutes);

  return diff <= 5;
}

/**
 * 次回実行時刻を取得
 */
export function getNextScheduledTime(
  schedule: { hour: number; minute: number; dayOfWeek?: number },
  now: Date = new Date()
): Date {
  const next = new Date(now);
  next.setHours(schedule.hour, schedule.minute, 0, 0);

  // 既に今日の実行時刻を過ぎている場合は翌日
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  // 曜日指定がある場合
  if (schedule.dayOfWeek !== undefined) {
    while (next.getDay() !== schedule.dayOfWeek) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next;
}

/**
 * 曜日名
 */
export const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * スケジュールの説明文を生成
 */
export function describeSchedule(
  schedule: { hour: number; minute: number; dayOfWeek?: number }
): string {
  const time = `${schedule.hour.toString().padStart(2, '0')}:${schedule.minute.toString().padStart(2, '0')}`;

  if (schedule.dayOfWeek !== undefined) {
    return `毎週${DAY_NAMES[schedule.dayOfWeek]}曜 ${time}`;
  }

  return `毎日 ${time}`;
}
