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

// ======== MBR本体 ========

export interface MbrSections {
  execSummary: string[];
  funnel: MbrFunnelSection;
  sales: MbrSalesSection;
  aiVpChanges: MbrAiVpChangesSection;
  suggestions: MbrSuggestionsSection;
  ops: MbrOpsSection;
  nextMonthFocus: string[];
}

export interface Mbr {
  id: string;
  month: string;           // YYYY-MM
  generatedAt: string;
  sections: MbrSections;
}
