/**
 * MBR (Monthly Business Review) 型定義
 *
 * Ticket 126: 月次改善レビュー自動生成
 */

import type { SalesResultCode } from '@/lib/tickets/types';
import type { AiVpSettingsEvent } from '@/lib/aiVp/settings';

// ======== セクション型 ========

/** A) 空室パイプライン（Vacancy funnel） */
export interface MbrFunnelSection {
  inquiries: number;
  byStatus: Record<string, number>;
  slaBreachCount: number;
  slaBreachRate: number;
  refTop: { ref: string; inquiries: number; accepted: number }[];
  avgDaysToClose: number;
}

/** B) 営業タスク（Sales task） */
export interface MbrSalesSection {
  generated: number;
  completed: number;
  completionRate: number;
  resultDistribution: { code: SalesResultCode | string; count: number; percentage: number }[];
  avgLeadTimeDays: number;
}

/** C) AI VP 設定変更履歴 */
export interface MbrAiVpChangesSection {
  totalEvents: number;
  byAction: Record<string, number>;
  recentEvents: Pick<AiVpSettingsEvent, 'id' | 'action' | 'createdAt' | 'note'>[];
}

/** D) 改善提案（leadScore suggestions） */
export interface MbrSuggestionsSection {
  openCount: number;
  acceptedCount: number;
  dismissedCount: number;
  acceptedKeys: string[];
}

/** E) 運用（Ops） */
export interface MbrOpsSection {
  weeklyRunCount: number;
  failedRunCount: number;
  failedSteps: string[];
  totalItemsProcessed: number;
  totalAlertsCreated: number;
}

/** blocked理由トップ（Ticket 132） */
export interface BlockedTopReason {
  code: string;
  label: string;
  count: number;
}

/** F) 改善タスク進捗（Ticket 129） */
export interface MbrImprovementProgressSection {
  /** 月別の進捗集計（最新3ヶ月分） */
  byMonth: MbrImprovementMonth[];
  /** 全体サマリー */
  totalTasks: number;
  totalDone: number;
  overallCompletionRate: number;
  /** 詰まり上位（blocked/overdue） */
  blockedTop: { id: string; title: string }[];
  overdueTop: { id: string; title: string }[];
  /** blocked理由トップ3（Ticket 132） */
  blockedTopReasons: BlockedTopReason[];
}

/** 月別改善タスク進捗 */
export interface MbrImprovementMonth {
  month: string;           // 起票元MBRの月（YYYY-MM）
  openCount: number;
  inProgressCount: number;
  completedCount: number;  // completed + closed + cancelled
  completionRate: number;
  overdueCount: number;
  total: number;
}

// ======== MBR本体 ========

export interface MbrSections {
  execSummary: string[];
  funnel: MbrFunnelSection;
  sales: MbrSalesSection;
  aiVpChanges: MbrAiVpChangesSection;
  suggestions: MbrSuggestionsSection;
  ops: MbrOpsSection;
  improvementProgress: MbrImprovementProgressSection; // Ticket 129
  nextMonthFocus: string[];
}

export interface Mbr {
  id: string;
  month: string;           // YYYY-MM
  generatedAt: string;
  sections: MbrSections;
}
