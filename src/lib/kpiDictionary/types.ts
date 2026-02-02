/**
 * KPI辞書の型定義
 *
 * KPIの定義・算出・意味・責任者・外部公開可否・異常検知ルールを管理
 */

import type { AppRole } from '@/config/appRoles';
import type { KPICategory, KPIFrequency } from '@/lib/kpi/types';

/**
 * KPIステータス
 */
export type KPIStatus = 'active' | 'deprecated';

/**
 * 算出方法
 */
export type CalculationMethod = 'manual' | 'sql' | 'code' | 'vendor';

/**
 * 更新頻度
 */
export type RefreshCadence = 'realtime' | 'daily' | 'weekly' | 'monthly';

/**
 * 方向性（上がると良い/下がると良い）
 */
export type Direction = 'higher_is_better' | 'lower_is_better' | 'neutral';

/**
 * KPI辞書エントリ（拡張KPIメタデータ）
 */
export interface KPIDictionaryEntry {
  // 基本情報
  id: string;
  name: string;
  description: string;
  unit: string;
  category: KPICategory;
  frequency: KPIFrequency;
  status: KPIStatus;

  // 責任者
  ownerRole: AppRole | null;
  ownerUserId: string | null;
  ownerUserName?: string;

  // 外部公開
  isExternalAllowed: boolean;

  // 方向性
  direction: Direction;

  // 目標・基準
  targetText: string | null;

  // 閾値
  thresholds?: {
    warning?: number;
    critical?: number;
  };

  // 定義・意味
  whyItMatters: string | null;
  definition: string | null;

  // 算出情報
  calculationMethod: CalculationMethod;
  calculationRef: string | null;         // 算出リファレンスID（kpi_calculation_refsへの参照）
  calculationNotes: string | null;
  dataSource: string | null;
  refreshCadence: RefreshCadence | null;

  // タグ
  tags: string[];

  // ダッシュボードリンク
  dashboardPath?: string;

  // メタ
  createdAt: string;
  updatedAt: string;
  lastDefinitionUpdatedAt: string | null;
}

/**
 * KPI辞書作成リクエスト
 */
export interface CreateKPIDictionaryRequest {
  id: string;
  name: string;
  description: string;
  unit: string;
  category: KPICategory;
  frequency: KPIFrequency;
  direction: Direction;
  isExternalAllowed?: boolean;
  ownerRole?: AppRole | null;
  ownerUserId?: string | null;
  targetText?: string | null;
  whyItMatters?: string | null;
  definition?: string | null;
  calculationMethod?: CalculationMethod;
  calculationRef?: string | null;
  calculationNotes?: string | null;
  dataSource?: string | null;
  refreshCadence?: RefreshCadence | null;
  tags?: string[];
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

/**
 * KPI辞書更新リクエスト
 */
export interface UpdateKPIDictionaryRequest {
  name?: string;
  description?: string;
  unit?: string;
  category?: KPICategory;
  frequency?: KPIFrequency;
  direction?: Direction;
  isExternalAllowed?: boolean;
  ownerRole?: AppRole | null;
  ownerUserId?: string | null;
  targetText?: string | null;
  whyItMatters?: string | null;
  definition?: string | null;
  calculationMethod?: CalculationMethod;
  calculationRef?: string | null;
  calculationNotes?: string | null;
  dataSource?: string | null;
  refreshCadence?: RefreshCadence | null;
  tags?: string[];
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

/**
 * KPI辞書フィルタ
 */
export interface KPIDictionaryFilter {
  q?: string;
  status?: KPIStatus;
  category?: KPICategory;
  tag?: string;
  ownerRole?: AppRole;
  limit?: number;
  offset?: number;
}

/**
 * 定義変更イベントタイプ
 */
export type DefinitionEventAction = 'create' | 'update' | 'deprecate' | 'restore';

/**
 * KPI定義変更イベント（監査ログ）
 */
export interface KPIDefinitionEvent {
  id: string;
  kpiId: string;
  actorUserId: string | null;
  actorUserName?: string;
  action: DefinitionEventAction;
  beforeJson: string | null;
  afterJson: string | null;
  note: string | null;
  createdAt: string;
}

/**
 * 異常検知ルール
 */
export interface KPIAnomalyRule {
  kpiId: string;
  enabled: boolean;
  missingDataAlert: boolean;
  thresholdHigh: number | null;
  thresholdLow: number | null;
  maxPercentChange: number | null;
  compareTo: 'prevDay' | 'prevWeek' | null;
  zScoreWindowDays: number | null;
  zScoreThreshold: number | null;
  ruleReason: string | null;               // ルール発火時の影響説明（任意）
  updatedAt: string;
}

/**
 * 異常検知ルール更新リクエスト
 */
export interface UpdateAnomalyRuleRequest {
  enabled?: boolean;
  missingDataAlert?: boolean;
  thresholdHigh?: number | null;
  thresholdLow?: number | null;
  maxPercentChange?: number | null;
  compareTo?: 'prevDay' | 'prevWeek' | null;
  zScoreWindowDays?: number | null;
  zScoreThreshold?: number | null;
  ruleReason?: string | null;
}

// ========== KPI算出リファレンス ==========

/**
 * 算出リファレンスタイプ
 */
export type CalculationRefType = 'sql' | 'code' | 'vendor';

/**
 * KPI算出リファレンス（算出ロジックの台帳）
 */
export interface KPICalculationRef {
  id: string;                               // 人間可読ID: 'kpi_sql_v1:approval_leadtime'
  type: CalculationRefType;
  title: string;
  body: string | null;                      // SQL本文など（codeの場合は空でOK）
  filePath: string | null;                  // codeの場所
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * KPI算出リファレンス作成リクエスト
 */
export interface CreateCalculationRefRequest {
  id: string;
  type: CalculationRefType;
  title: string;
  body?: string | null;
  filePath?: string | null;
  ownerUserId?: string | null;
}

/**
 * KPI算出リファレンス更新リクエスト
 */
export interface UpdateCalculationRefRequest {
  type?: CalculationRefType;
  title?: string;
  body?: string | null;
  filePath?: string | null;
  ownerUserId?: string | null;
}
