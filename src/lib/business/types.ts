/**
 * 事業別サマリー（Business Summary）型定義
 *
 * 事業単位マスタと集計サマリー
 */

// ========== 権限コンテキスト ==========

export type UserRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

export interface ViewerContext {
  userId: string;
  role: UserRole;
}

// ========== 事業種別 ==========

export type BusinessUnitType =
  | 'homecare'    // 訪問介護
  | 'nursing'     // 訪問看護
  | 'housing'     // サービス付き高齢者向け住宅
  | 'facility'    // 入所施設
  | 'corp'        // 法人本部
  | 'other';      // その他

export const BUSINESS_UNIT_TYPE_LABELS: Record<BusinessUnitType, string> = {
  homecare: '訪問介護',
  nursing: '訪問看護',
  housing: 'サ高住',
  facility: '入所施設',
  corp: '法人本部',
  other: 'その他',
};

export const BUSINESS_UNIT_TYPE_CONFIG: Record<
  BusinessUnitType,
  { label: string; icon: string; color: string; bgColor: string }
> = {
  homecare: { label: '訪問介護', icon: 'Home', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  nursing: { label: '訪問看護', icon: 'Heart', color: 'text-pink-700', bgColor: 'bg-pink-50' },
  housing: { label: 'サ高住', icon: 'Building', color: 'text-green-700', bgColor: 'bg-green-50' },
  facility: { label: '入所施設', icon: 'Building2', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  corp: { label: '法人本部', icon: 'Briefcase', color: 'text-zinc-700', bgColor: 'bg-zinc-100' },
  other: { label: 'その他', icon: 'MoreHorizontal', color: 'text-zinc-500', bgColor: 'bg-zinc-50' },
};

// ========== 事業単位 ==========

export interface BusinessUnit {
  id: string;
  name: string;
  type: BusinessUnitType;
  locationHint: string | null;
  orgUnitId: string | null;           // Task 030: 組織ツリーとの紐付け
  isActive: boolean;
  ownerUserId: string | null;
  ownerName: string | null;           // 表示用
  createdAt: string;
  updatedAt: string;
}

// ========== サマリー期間 ==========

export type SummaryRange = 'thisMonth' | 'thisWeek' | 'today';

export const SUMMARY_RANGE_LABELS: Record<SummaryRange, string> = {
  thisMonth: '今月',
  thisWeek: '今週',
  today: '今日',
};

// ========== ハイライト指標 ==========

export interface KpiHighlight {
  kpiId: string;
  name: string;
  displayValue: string;
  trend: 'up' | 'down' | 'flat' | null;
  trendText: string | null;
  url: string;
  // Task 041: 辞書参照で方向性・重要性を表示
  direction?: 'higher_is_better' | 'lower_is_better' | 'neutral' | null;
  whyItMatters?: string | null;
}

export interface AlertsHighlight {
  criticalOpen: number;
  warningOpen: number;
  url: string;
}

export interface TicketsHighlight {
  open: number;
  overdue: number;
  urgentOpen: number;
  url: string;
}

export interface RepairsHighlight {
  highRiskOpen: number;
  overdue: number;
  url: string;
}

export interface ComplaintsHighlight {
  highOpen: number;
  criticalOpen: number;
  overdue: number;
  url: string;
}

export interface CorrectiveActionsHighlight {
  open: number;
  criticalOpen: number;
  overdue: number;
  url: string;
}

export interface TrainingHighlight {
  overdue: number;
  url: string;
}

export interface LicensesHighlight {
  expired: number;
  expiring30: number;
  url: string;
}

export interface ReceivablesHighlight {
  overdueTotal: number;
  aging60Count: number;
  url: string;
}

export interface CollectionHighlight {
  overdueSteps: number;
  url: string;
}

export interface AgreementsHighlight {
  expired: number;
  expiring30: number;
  url: string;
}

export interface BusinessHighlights {
  kpi: { keyMetrics: KpiHighlight[] };
  alerts: AlertsHighlight;
  tickets: TicketsHighlight;
  repairs: RepairsHighlight;
  complaints: ComplaintsHighlight;
  correctiveActions: CorrectiveActionsHighlight;
  training: TrainingHighlight;
  licenses: LicensesHighlight;
  receivables: ReceivablesHighlight;
  collection: CollectionHighlight;
  agreements: AgreementsHighlight;
}

// ========== コメンタリー ==========

export interface BusinessCommentary {
  summaryText: string;
  topRisks: string[];
  nextActions: string[];
}

// ========== 事業別サマリー ==========

export interface BusinessSummary {
  businessUnit: BusinessUnit | null;    // nullの場合は全体
  range: SummaryRange;
  generatedAt: string;
  highlights: BusinessHighlights;
  commentary: BusinessCommentary;
}

// ========== RBAC ==========

/**
 * 事業別サマリーの閲覧が可能か
 */
export function canViewBusinessSummary(role: UserRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * 全事業の閲覧が可能か（manager以上）
 */
export function canViewAllBusinessUnits(role: UserRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * 事業マスタの管理が可能か
 */
export function canManageBusinessUnits(role: UserRole): boolean {
  return ['admin', 'executive'].includes(role);
}

// ========== 入力型 ==========

export interface CreateBusinessUnitInput {
  name: string;
  type: BusinessUnitType;
  locationHint?: string | null;
  orgUnitId?: string | null;          // Task 030: 組織ツリーとの紐付け
  ownerUserId?: string | null;
}

export interface UpdateBusinessUnitInput {
  name?: string;
  type?: BusinessUnitType;
  locationHint?: string | null;
  orgUnitId?: string | null;          // Task 030: 組織ツリーとの紐付け
  ownerUserId?: string | null;
  isActive?: boolean;
}
