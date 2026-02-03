/**
 * KPI辞書 未整備KPI検出（Task 056）
 *
 * - KPI辞書の欠損フィールドを自動検出
 * - 運用チケット自動生成用のデータを提供
 * - WBR品質向上のための棚卸し支援
 */

import type { KPIDictionaryEntry } from './types';
import { listKPIDictionary } from './repo';
import { getAnomalyRule } from './anomalyRuleRepo';

// ========== 未整備判定フィールド ==========

/**
 * 必須フィールド（WBR品質直結）
 */
export const REQUIRED_FIELDS = [
  'direction',
  'whyItMatters',
  'calculationMethod',
  'calculationRef',
] as const;

/**
 * 推奨フィールド（運用品質向上）
 */
export const RECOMMENDED_FIELDS = [
  'dataSource',
  'refreshCadence',
] as const;

/**
 * 欠損タイプ
 */
export type MissingFieldType =
  | typeof REQUIRED_FIELDS[number]
  | typeof RECOMMENDED_FIELDS[number]
  | 'anomalyRule';

/**
 * 未整備KPI情報
 */
export interface IncompleteKpi {
  kpiId: string;
  name: string;
  category: string;
  ownerRole: string | null;
  missing: MissingFieldType[];
  requiredMissing: typeof REQUIRED_FIELDS[number][];
  recommendedMissing: (typeof RECOMMENDED_FIELDS[number] | 'anomalyRule')[];
  severity: 'high' | 'medium' | 'low';
  lastUpdatedAt: string;
}

/**
 * 検出オプション
 */
export interface FindIncompleteKpisOptions {
  /** active KPIのみ対象 (default: true) */
  activeOnly?: boolean;
  /** 必須フィールドの欠損のみ検出 (default: false) */
  requiredOnly?: boolean;
  /** 異常検知ルール未設定も検出 (default: true) */
  includeAnomalyRules?: boolean;
  /** 対象カテゴリ（指定なしは全て） */
  categories?: string[];
  /** 対象オーナーロール（指定なしは全て） */
  ownerRoles?: string[];
}

// ========== 検出ロジック ==========

/**
 * direction が未設定かチェック
 */
function isDirectionMissing(entry: KPIDictionaryEntry): boolean {
  return !entry.direction || entry.direction === 'neutral';
}

/**
 * whyItMatters が空かチェック
 */
function isWhyItMattersMissing(entry: KPIDictionaryEntry): boolean {
  return !entry.whyItMatters || entry.whyItMatters.trim() === '';
}

/**
 * calculationMethod が未設定かチェック
 */
function isCalculationMethodMissing(entry: KPIDictionaryEntry): boolean {
  // 'manual' はデフォルト値なので、明示的に設定されていない可能性がある
  // ただし、calculationRef が設定されていれば意図的な設定と見なす
  if (entry.calculationRef) return false;
  return entry.calculationMethod === 'manual';
}

/**
 * calculationRef が未設定かチェック
 */
function isCalculationRefMissing(entry: KPIDictionaryEntry): boolean {
  return !entry.calculationRef || entry.calculationRef.trim() === '';
}

/**
 * dataSource が未設定かチェック
 */
function isDataSourceMissing(entry: KPIDictionaryEntry): boolean {
  return !entry.dataSource || entry.dataSource.trim() === '';
}

/**
 * refreshCadence が未設定かチェック
 */
function isRefreshCadenceMissing(entry: KPIDictionaryEntry): boolean {
  return !entry.refreshCadence;
}

/**
 * 欠損フィールドを検出
 */
function detectMissingFields(
  entry: KPIDictionaryEntry,
  includeAnomalyRules: boolean
): {
  required: typeof REQUIRED_FIELDS[number][];
  recommended: (typeof RECOMMENDED_FIELDS[number] | 'anomalyRule')[];
} {
  const required: typeof REQUIRED_FIELDS[number][] = [];
  const recommended: (typeof RECOMMENDED_FIELDS[number] | 'anomalyRule')[] = [];

  // 必須フィールド
  if (isDirectionMissing(entry)) required.push('direction');
  if (isWhyItMattersMissing(entry)) required.push('whyItMatters');
  if (isCalculationMethodMissing(entry)) required.push('calculationMethod');
  if (isCalculationRefMissing(entry)) required.push('calculationRef');

  // 推奨フィールド
  if (isDataSourceMissing(entry)) recommended.push('dataSource');
  if (isRefreshCadenceMissing(entry)) recommended.push('refreshCadence');

  // 異常検知ルール
  if (includeAnomalyRules) {
    const rule = getAnomalyRule(entry.id);
    if (!rule || !rule.enabled) {
      recommended.push('anomalyRule');
    }
  }

  return { required, recommended };
}

/**
 * 欠損の重要度を判定
 */
function determineSeverity(
  requiredCount: number,
  recommendedCount: number
): 'high' | 'medium' | 'low' {
  if (requiredCount >= 3) return 'high';
  if (requiredCount >= 1) return 'medium';
  if (recommendedCount >= 2) return 'low';
  return 'low';
}

// ========== メイン検出関数 ==========

/**
 * 未整備KPIを検出
 */
export function findIncompleteKpis(
  options: FindIncompleteKpisOptions = {}
): IncompleteKpi[] {
  const {
    activeOnly = true,
    requiredOnly = false,
    includeAnomalyRules = true,
    categories,
    ownerRoles,
  } = options;

  // KPI辞書を取得
  const { entries } = listKPIDictionary({
    status: activeOnly ? 'active' : undefined,
    limit: 1000,
  });

  const incompleteKpis: IncompleteKpi[] = [];

  for (const entry of entries) {
    // カテゴリフィルタ
    if (categories && categories.length > 0 && !categories.includes(entry.category)) {
      continue;
    }

    // オーナーロールフィルタ
    if (ownerRoles && ownerRoles.length > 0 && !ownerRoles.includes(entry.ownerRole ?? '')) {
      continue;
    }

    // 欠損フィールド検出
    const { required, recommended } = detectMissingFields(entry, includeAnomalyRules);

    // requiredOnlyモードの場合は推奨フィールドを無視
    const effectiveRecommended = requiredOnly ? [] : recommended;

    // 欠損がなければスキップ
    if (required.length === 0 && effectiveRecommended.length === 0) {
      continue;
    }

    const missing: MissingFieldType[] = [...required, ...effectiveRecommended];
    const severity = determineSeverity(required.length, effectiveRecommended.length);

    incompleteKpis.push({
      kpiId: entry.id,
      name: entry.name,
      category: entry.category,
      ownerRole: entry.ownerRole,
      missing,
      requiredMissing: required,
      recommendedMissing: effectiveRecommended,
      severity,
      lastUpdatedAt: entry.updatedAt,
    });
  }

  // 重要度順にソート（high → medium → low）
  const severityOrder: Record<'high' | 'medium' | 'low', number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  incompleteKpis.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return incompleteKpis;
}

// ========== サマリー関数 ==========

/**
 * 未整備KPIサマリー
 */
export interface IncompleteKpiSummary {
  total: number;
  byCategory: Record<string, number>;
  byOwnerRole: Record<string, number>;
  bySeverity: Record<'high' | 'medium' | 'low', number>;
  byMissingField: Record<MissingFieldType, number>;
}

/**
 * 未整備KPIのサマリーを取得
 */
export function getIncompleteKpiSummary(
  options: FindIncompleteKpisOptions = {}
): IncompleteKpiSummary {
  const incompleteKpis = findIncompleteKpis(options);

  const summary: IncompleteKpiSummary = {
    total: incompleteKpis.length,
    byCategory: {},
    byOwnerRole: {},
    bySeverity: { high: 0, medium: 0, low: 0 },
    byMissingField: {} as Record<MissingFieldType, number>,
  };

  for (const kpi of incompleteKpis) {
    // カテゴリ別
    summary.byCategory[kpi.category] = (summary.byCategory[kpi.category] ?? 0) + 1;

    // オーナーロール別
    const role = kpi.ownerRole ?? 'unassigned';
    summary.byOwnerRole[role] = (summary.byOwnerRole[role] ?? 0) + 1;

    // 重要度別
    summary.bySeverity[kpi.severity]++;

    // 欠損フィールド別
    for (const field of kpi.missing) {
      summary.byMissingField[field] = (summary.byMissingField[field] ?? 0) + 1;
    }
  }

  return summary;
}

// ========== フィールド名ラベル ==========

/**
 * フィールド名の日本語ラベル
 */
export const MISSING_FIELD_LABELS: Record<MissingFieldType, string> = {
  direction: '方向性（上がる/下がると良い）',
  whyItMatters: 'このKPIが重要な理由',
  calculationMethod: '算出方法',
  calculationRef: '算出リファレンス',
  dataSource: 'データソース',
  refreshCadence: '更新頻度',
  anomalyRule: '異常検知ルール',
};

/**
 * 欠損フィールドの説明を生成
 */
export function formatMissingFields(missing: MissingFieldType[]): string {
  return missing.map((f) => MISSING_FIELD_LABELS[f]).join('、');
}

// ========== チケット自動生成（Task 056） ==========

import { createTicket, listTickets } from '@/lib/tickets/repo';
import type { Ticket, TicketPriority, ViewerContext } from '@/lib/tickets/types';

/**
 * KPI整備チケットのfingerprint生成
 */
function buildKpiMaintenanceFingerprint(kpiId: string): string {
  return `kpi_maintenance:${kpiId}`;
}

/**
 * チケット生成結果
 */
export interface GenerateKpiMaintenanceTicketsResult {
  created: number;
  skipped: number;
  existingTicketIds: string[];
  newTickets: Ticket[];
}

/**
 * チケット生成オプション
 */
export interface GenerateKpiMaintenanceTicketsOptions extends FindIncompleteKpisOptions {
  /** dryRunモード（実際にはチケットを作成しない） */
  dryRun?: boolean;
  /** 作成するチケットの最大数 (default: 10) */
  maxTickets?: number;
  /** high重要度のみチケット化 (default: false) */
  highSeverityOnly?: boolean;
  /** チケットの期限日数（今日から何日後か） (default: 14) */
  dueDays?: number;
}

/**
 * KPI辞書整備チケットを自動生成
 *
 * 冪等性：同じKPIに対して既にopenチケットがあればスキップ
 */
export function generateKpiMaintenanceTickets(
  options: GenerateKpiMaintenanceTicketsOptions = {}
): GenerateKpiMaintenanceTicketsResult {
  const {
    dryRun = false,
    maxTickets = 10,
    highSeverityOnly = false,
    dueDays = 14,
    ...findOptions
  } = options;

  // 未整備KPIを検出
  let incompleteKpis = findIncompleteKpis(findOptions);

  // high重要度のみフィルタ
  if (highSeverityOnly) {
    incompleteKpis = incompleteKpis.filter((k) => k.severity === 'high');
  }

  // 既存のKPI整備チケットを取得（冪等性チェック用）
  const systemViewer: ViewerContext = { userId: 'system', role: 'admin' };
  const { items: existingTickets } = listTickets(
    { category: 'ops', limit: 1000 },
    systemViewer
  );

  // 既存チケットのfingerprintセット
  const existingFingerprints = new Set<string>();
  const existingTicketIds: string[] = [];

  for (const ticket of existingTickets) {
    // KPI整備チケットかどうかを判定
    if (
      ticket.relatedType === null &&
      ticket.tagsJson?.includes('kpi_maintenance') &&
      ['open', 'in_progress', 'waiting'].includes(ticket.status)
    ) {
      // タイトルからKPI IDを抽出
      const match = ticket.title.match(/\[([^\]]+)\]/);
      if (match) {
        const fingerprint = buildKpiMaintenanceFingerprint(match[1]);
        existingFingerprints.add(fingerprint);
        existingTicketIds.push(ticket.id);
      }
    }
  }

  const result: GenerateKpiMaintenanceTicketsResult = {
    created: 0,
    skipped: 0,
    existingTicketIds,
    newTickets: [],
  };

  // チケット生成
  for (const kpi of incompleteKpis) {
    // 最大数チェック
    if (result.created >= maxTickets) {
      result.skipped += incompleteKpis.length - result.created - result.skipped;
      break;
    }

    // 冪等性チェック
    const fingerprint = buildKpiMaintenanceFingerprint(kpi.kpiId);
    if (existingFingerprints.has(fingerprint)) {
      result.skipped++;
      continue;
    }

    // dryRunモードでは作成しない
    if (dryRun) {
      result.created++;
      continue;
    }

    // チケット作成
    const priority = severityToTicketPriority(kpi.severity);
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + dueDays);

    const ticket = createTicket(
      {
        title: `[${kpi.kpiId}] KPI辞書整備: ${kpi.name}`,
        description: buildTicketDescription(kpi),
        priority,
        category: 'ops',
        dueAt: dueAt.toISOString().split('T')[0],
        tags: ['kpi_maintenance', 'auto_generated', kpi.category],
      },
      'system'
    );

    result.newTickets.push(ticket);
    result.created++;
    existingFingerprints.add(fingerprint);
  }

  return result;
}

/**
 * 重要度をチケット優先度に変換
 */
function severityToTicketPriority(severity: 'high' | 'medium' | 'low'): TicketPriority {
  switch (severity) {
    case 'high':
      return 'high';
    case 'medium':
      return 'normal';
    case 'low':
      return 'low';
  }
}

/**
 * チケット説明文を生成
 */
function buildTicketDescription(kpi: IncompleteKpi): string {
  const lines: string[] = [
    `## KPI辞書整備タスク`,
    ``,
    `**KPI ID:** ${kpi.kpiId}`,
    `**KPI名:** ${kpi.name}`,
    `**カテゴリ:** ${kpi.category}`,
    `**オーナーロール:** ${kpi.ownerRole ?? '未設定'}`,
    `**重要度:** ${kpi.severity}`,
    ``,
    `---`,
    ``,
    `## 不足している項目`,
    ``,
  ];

  if (kpi.requiredMissing.length > 0) {
    lines.push(`### 必須項目（WBR品質直結）`);
    for (const field of kpi.requiredMissing) {
      lines.push(`- [ ] ${MISSING_FIELD_LABELS[field]}`);
    }
    lines.push(``);
  }

  if (kpi.recommendedMissing.length > 0) {
    lines.push(`### 推奨項目`);
    for (const field of kpi.recommendedMissing) {
      lines.push(`- [ ] ${MISSING_FIELD_LABELS[field]}`);
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);
  lines.push(`## 対応方法`);
  lines.push(``);
  lines.push(`1. KPI辞書の該当エントリを開く: \`/admin/kpi-dictionary/${kpi.kpiId}\``);
  lines.push(`2. 上記の不足項目を埋める`);
  lines.push(`3. 変更を保存して、このチケットを解決にする`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`*このチケットはTask 056により自動生成されました*`);

  return lines.join('\n');
}

// ========== 週次棚卸しAPI ==========

/**
 * 週次棚卸し結果
 */
export interface WeeklyKpiAuditResult {
  summary: IncompleteKpiSummary;
  ticketsGenerated: GenerateKpiMaintenanceTicketsResult;
  auditedAt: string;
}

/**
 * 週次KPI辞書棚卸しを実行
 */
export function runWeeklyKpiAudit(
  options: GenerateKpiMaintenanceTicketsOptions = {}
): WeeklyKpiAuditResult {
  const findOptions: FindIncompleteKpisOptions = {
    activeOnly: options.activeOnly,
    requiredOnly: options.requiredOnly,
    includeAnomalyRules: options.includeAnomalyRules,
    categories: options.categories,
    ownerRoles: options.ownerRoles,
  };

  const summary = getIncompleteKpiSummary(findOptions);
  const ticketsGenerated = generateKpiMaintenanceTickets(options);

  return {
    summary,
    ticketsGenerated,
    auditedAt: new Date().toISOString(),
  };
}
