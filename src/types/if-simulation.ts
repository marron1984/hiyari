/**
 * AI副社長「ifシミュレーション」関連の型定義
 * 経営判断の事前検討用に、3案固定のシミュレーション結果を生成
 */

/** シナリオタイプ */
export type ScenarioType =
  | 'staff_reduction'      // 人員削減
  | 'staff_increase'       // 人員増加
  | 'price_change'         // 価格変更
  | 'service_expansion'    // サービス拡大
  | 'cost_reduction'       // コスト削減
  | 'facility_renovation'  // 施設改修
  | 'marketing_investment' // マーケティング投資
  | 'custom';              // カスタム

/** シナリオタイプの表示名 */
export const SCENARIO_TYPE_LABELS: Record<ScenarioType, string> = {
  staff_reduction: '人員削減',
  staff_increase: '人員増加',
  price_change: '価格変更',
  service_expansion: 'サービス拡大',
  cost_reduction: 'コスト削減',
  facility_renovation: '施設改修',
  marketing_investment: 'マーケティング投資',
  custom: 'カスタム',
};

/** 期間設定 */
export interface SimulationPeriod {
  startMonth: string; // YYYY-MM
  months: number;     // シミュレーション期間（月数）
}

/** オプションパラメータ */
export interface SimulationOptionalParams {
  /** 変動率（%） */
  changeRate?: number;
  /** 初期投資額（円） */
  initialInvestment?: number;
  /** 目標値 */
  targetValue?: number;
  /** カスタム説明 */
  customDescription?: string;
  /** 追加パラメータ */
  [key: string]: string | number | boolean | undefined;
}

/** シミュレーション入力 */
export interface IfSimulationInput {
  scenarioType: ScenarioType;
  baseId: string;
  period: SimulationPeriod;
  optionalParams?: SimulationOptionalParams;
}

/** 月次KPIデータ */
export interface MonthlyKpi {
  month: string;        // YYYY-MM
  baseId: string;
  occupancyRate: number;  // 入居率（%）
  revenue: number;        // 売上（円）
  laborCost: number;      // 人件費（円）
  laborCostRatio: number; // 人件費率（%）
  operatingCost: number;  // 運営費（円）
  profit: number;         // 利益（円）
  profitRate: number;     // 利益率（%）
  staffCount: number;     // スタッフ数
  residentCount: number;  // 入居者数
}

/** シミュレーション結果の月次予測 */
export interface MonthlyProjection {
  month: string;
  occupancyRate: number;
  revenue: number;
  laborCost: number;
  laborCostRatio: number;
  profit: number;
  profitRate: number;
}

/** リスク項目 */
export interface RiskItem {
  category: 'financial' | 'operational' | 'regulatory' | 'market' | 'human_resource';
  description: string;
  impact: 'high' | 'medium' | 'low';
  probability: 'high' | 'medium' | 'low';
}

/** リスクカテゴリの表示名 */
export const RISK_CATEGORY_LABELS: Record<RiskItem['category'], string> = {
  financial: '財務リスク',
  operational: '運営リスク',
  regulatory: '規制リスク',
  market: '市場リスク',
  human_resource: '人材リスク',
};

/** インパクト・確率の表示名 */
export const RISK_LEVEL_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 単一プラン（A/B/C） */
export interface SimulationPlan {
  planId: 'A' | 'B' | 'C';
  planName: string;
  description: string;

  /** 前提条件 */
  assumptions: string[];

  /** 月次予測 */
  monthlyProjections: MonthlyProjection[];

  /** サマリー数値 */
  summary: {
    totalRevenue: number;
    totalProfit: number;
    averageOccupancyRate: number;
    averageLaborCostRatio: number;
    averageProfitRate: number;
    revenueChange: number;      // 現状比変化率（%）
    profitChange: number;       // 現状比変化率（%）
    breakEvenMonth?: number;    // 損益分岐月（初期投資がある場合）
  };

  /** リスク一覧 */
  risks: RiskItem[];

  /** 数値根拠（計算式など） */
  calculations: string[];
}

/** シミュレーション結果全体 */
export interface IfSimulationResult {
  id: string;
  createdAt: Date;
  createdBy: string;

  /** 入力パラメータ */
  input: IfSimulationInput;

  /** 拠点名 */
  baseName: string;

  /** 参照した過去KPI期間 */
  referenceKpiPeriod: {
    from: string; // YYYY-MM
    to: string;   // YYYY-MM
    months: number;
  };

  /** 現状サマリー（比較用） */
  currentStatus: {
    averageOccupancyRate: number;
    averageRevenue: number;
    averageLaborCostRatio: number;
    averageProfitRate: number;
    latestStaffCount: number;
    latestResidentCount: number;
  };

  /** 3つのプラン */
  plans: [SimulationPlan, SimulationPlan, SimulationPlan];

  /** AIモデル情報 */
  aiModel: string;
  promptVersion: string;
}

/** Firestore保存用 */
export interface IfSimulationDocument extends Omit<IfSimulationResult, 'createdAt'> {
  createdAt: FirebaseFirestore.Timestamp;
}

/** API リクエスト */
export interface IfSimulationRequest {
  scenarioType: ScenarioType;
  baseId: string;
  period: SimulationPeriod;
  optionalParams?: SimulationOptionalParams;
}

/** API レスポンス */
export interface IfSimulationResponse {
  success: boolean;
  simulation?: IfSimulationResult;
  error?: string;
}

/** シミュレーション履歴取得レスポンス */
export interface IfSimulationHistoryResponse {
  success: boolean;
  simulations?: IfSimulationResult[];
  error?: string;
}

/** プロンプトバージョン */
export const IF_SIMULATION_PROMPT_VERSION = 'v1.0.0';
