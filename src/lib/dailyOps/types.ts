/**
 * 日次オペレーション（Daily Ops）型定義
 *
 * Implementation Ticket 045: 監視＆滞留防止の自動運用
 */

/**
 * 日次ジョブのステップ名
 */
export type DailyOpsStepName =
  | 'unclassified_scan'          // 未分類スコープ（Task 033）
  | 'kpi_anomaly_scan'           // KPI異常（Task 010）
  | 'licenses_scan'              // 資格期限（Task 014）
  | 'contracts_scan'             // 契約期限（Task 026）
  | 'agreements_scan'            // 同意書期限（Task 024）
  | 'tickets_backlog_scan'       // チケット滞留（Task 010/002）
  | 'repairs_risk_scan'          // 修繕リスク（Task 011/002）
  | 'corrective_actions_scan'    // 是正措置遅延（Task 017/002）
  | 'collection_flow_scan';      // 回収フロー遅延（Task 021）

/**
 * ステップ実行結果
 */
export interface DailyOpsStepResult {
  name: DailyOpsStepName;
  ok: boolean;
  alertsCreated: number;
  alertsSkipped: number;
  notificationsCreated: number;
  errorMessage?: string;
  durationMs: number;
}

/**
 * 日次実行ログ
 */
export interface DailyOpsRun {
  id: string;
  date: string;              // YYYY-MM-DD
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  steps: DailyOpsStepResult[];
  totalAlertsCreated: number;
  totalAlertsSkipped: number;
  totalNotifications: number;
  errorMessage?: string;
}

/**
 * ノイズ抑制の重要度閾値
 */
export type NoiseSeverityThreshold = 'info' | 'warning' | 'critical';

/**
 * 実行オプション
 */
export interface DailyOpsOptions {
  /** trueならalert/通知を作成しない（プレビュー） */
  dryRun?: boolean;
  /** 通知を出す最低重要度（デフォルト: warning） */
  notificationThreshold?: NoiseSeverityThreshold;
  /** 特定ステップのみ実行 */
  steps?: DailyOpsStepName[];
  /** 強制実行（同日に既に実行済みでも実行） */
  force?: boolean;
}

/**
 * 日次実行結果
 */
export interface DailyOpsResult {
  run: DailyOpsRun;
  skipped: boolean;
  reason?: string;
}

/**
 * fingerprint生成のための日付取得
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 日次用fingerprintを生成
 */
export function generateDailyFingerprint(
  type: string,
  sourceId: string | null,
  date: string = getTodayDateString()
): string {
  const parts: string[] = [type];
  if (sourceId) parts.push(sourceId);
  parts.push(date);
  return parts.join(':');
}
