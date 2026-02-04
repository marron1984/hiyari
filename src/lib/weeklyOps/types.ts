/**
 * 週次オペレーション（Weekly Ops）型定義
 *
 * Implementation Ticket 067: weekly-ops の本番運用固定
 */

/**
 * 週次ジョブのステップ名
 */
export type WeeklyOpsStepName =
  | 'wbr_generation'          // WBR（週次ビジネスレビュー）生成
  | 'kpi_weekly_summary'      // KPI週次サマリー
  | 'training_summary'        // 研修進捗サマリー
  | 'licenses_summary'        // 資格期限サマリー
  | 'tickets_weekly_report'   // チケット週次レポート
  | 'repairs_weekly_report'   // 修繕週次レポート
  | 'agreements_summary'      // 同意書サマリー
  | 'receivables_summary';    // 未収金サマリー

/**
 * ステップ実行結果
 */
export interface WeeklyOpsStepResult {
  name: WeeklyOpsStepName;
  ok: boolean;
  itemsProcessed: number;
  alertsCreated: number;
  errorMessage?: string;
  durationMs: number;
  /** 生成されたレポートのURL（WBRなど） */
  reportUrl?: string;
}

/**
 * 週次実行ログ
 */
export interface WeeklyOpsRun {
  id: string;
  /** 週の開始日（YYYY-MM-DD、月曜日） */
  weekStart: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  steps: WeeklyOpsStepResult[];
  totalItemsProcessed: number;
  totalAlertsCreated: number;
  errorMessage?: string;
  /** 失敗したステップ名（復旧導線用） */
  failedSteps?: WeeklyOpsStepName[];
}

/**
 * 実行オプション
 */
export interface WeeklyOpsOptions {
  /** trueなら実際の処理を行わない（プレビュー） */
  dryRun?: boolean;
  /** 特定ステップのみ実行 */
  steps?: WeeklyOpsStepName[];
  /** 強制実行（同週に既に実行済みでも実行） */
  force?: boolean;
  /** 対象週の開始日（指定しない場合は今週） */
  weekStart?: string;
}

/**
 * 週次実行結果
 */
export interface WeeklyOpsResult {
  run: WeeklyOpsRun;
  skipped: boolean;
  reason?: string;
}

/**
 * 今週の月曜日の日付を取得（YYYY-MM-DD）
 */
export function getWeekStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  // 日曜日(0)の場合は前週の月曜日
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

/**
 * 週次用fingerprintを生成
 */
export function generateWeeklyFingerprint(
  type: string,
  sourceId: string | null,
  weekStart: string
): string {
  const parts: string[] = [type];
  if (sourceId) parts.push(sourceId);
  parts.push(`week:${weekStart}`);
  return parts.join(':');
}
