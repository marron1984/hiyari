/**
 * AI副社長「吉田判断ログ学習」関連の型定義
 * 吉田の判断基準をAIに蓄積し、類似度として可視化
 */

/** 判断ログの種別 */
export type DecisionLogType =
  | 'approval'            // 承認判断
  | 'hr_decision'         // 人事判断
  | 'management_decision'; // 経営判断

/** 判断ログ種別の表示名 */
export const DECISION_LOG_TYPE_LABELS: Record<DecisionLogType, string> = {
  approval: '承認判断',
  hr_decision: '人事判断',
  management_decision: '経営判断',
};

/** 判断コンテキスト */
export interface DecisionContext {
  /** 守りたい軸（何を優先したか） */
  protectedValue: string;
  /** 嫌ったリスク（何を避けたか） */
  avoidedRisk: string;
  /** 代替案の有無 */
  hasAlternative: boolean;
  /** 代替案の内容（ある場合） */
  alternativeDescription?: string;
}

/** 判断ログ（吉田の過去の判断） */
export interface DecisionLog {
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt?: Date;

  /** 判断種別 */
  logType: DecisionLogType;

  /** 判断対象（申請ID、案件名など） */
  targetId?: string;
  targetTitle: string;
  targetDescription: string;

  /** 判断コンテキスト */
  decisionContext: DecisionContext;

  /** 最終判断 */
  finalDecision: string;

  /** 判断理由 */
  decisionReason?: string;

  /** 判断者 */
  decidedBy: 'yoshida';

  /** 判断日時 */
  decidedAt: Date;

  /** 関連データ（任意） */
  metadata?: Record<string, unknown>;
}

/** Firestore保存用 */
export interface DecisionLogDocument extends Omit<DecisionLog, 'createdAt' | 'updatedAt' | 'decidedAt'> {
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
  decidedAt: FirebaseFirestore.Timestamp;
}

/** 類似度分析の入力 */
export interface SimilarityAnalysisInput {
  /** 現在のケース */
  currentCase: {
    title: string;
    description: string;
    context?: Partial<DecisionContext>;
    logType?: DecisionLogType;
  };
  /** 過去の判断ログ（自動取得または指定） */
  pastDecisions?: DecisionLog[];
}

/** 類似度分析の結果 */
export interface SimilarityAnalysisResult {
  id: string;
  createdAt: Date;
  createdBy: string;

  /** 入力 */
  input: SimilarityAnalysisInput;

  /** 類似度（%） */
  similarityScore: number;

  /** 最も類似した過去の判断 */
  mostSimilarDecision?: {
    id: string;
    title: string;
    finalDecision: string;
    decidedAt: Date;
  };

  /** 一致点（最大3つ） */
  matchingPoints: string[];

  /** 相違点（最大2つ） */
  differences: string[];

  /** 注意点（断定禁止） */
  cautions: string[];

  /** 参照した過去判断の数 */
  referencedDecisionCount: number;

  /** AIモデル情報 */
  aiModel: string;
  promptVersion: string;
}

/** 判断ログ登録リクエスト */
export interface DecisionLogRequest {
  logType: DecisionLogType;
  targetId?: string;
  targetTitle: string;
  targetDescription: string;
  decisionContext: DecisionContext;
  finalDecision: string;
  decisionReason?: string;
  metadata?: Record<string, unknown>;
}

/** 類似度分析リクエスト */
export interface SimilarityAnalysisRequest {
  title: string;
  description: string;
  logType?: DecisionLogType;
  context?: Partial<DecisionContext>;
}

/** API レスポンス */
export interface DecisionLogResponse {
  success: boolean;
  decisionLog?: DecisionLog;
  error?: string;
}

export interface SimilarityAnalysisResponse {
  success: boolean;
  analysis?: SimilarityAnalysisResult;
  error?: string;
}

export interface DecisionLogListResponse {
  success: boolean;
  decisionLogs?: DecisionLog[];
  total?: number;
  error?: string;
}

/** プロンプトバージョン */
export const YOSHIDA_LEARNING_PROMPT_VERSION = 'v1.0.0';

/** 類似度の閾値 */
export const SIMILARITY_THRESHOLDS = {
  high: 80,    // 高い類似性
  medium: 50,  // 中程度の類似性
  low: 30,     // 低い類似性
};
