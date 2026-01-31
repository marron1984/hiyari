// ======== 幹部AI（AI副社長 分身ノード）型定義 ========

// ======== 相談カテゴリ ========
export type ConsultationCategory =
  | 'hr'           // 人事・労務
  | 'finance'      // 財務・予算
  | 'operation'    // 業務・運営
  | 'compliance'   // コンプライアンス
  | 'strategy'     // 経営戦略
  | 'customer'     // 顧客対応
  | 'other';       // その他

// ======== 緊急度 ========
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

// ======== エスカレーション状態 ========
export type EscalationStatus =
  | 'none'         // エスカレーション不要
  | 'draft'        // 下書き作成済
  | 'sent'         // 送信済み
  | 'acknowledged' // 吉田確認済み
  | 'resolved';    // 解決済み

// ======== 相談リクエスト ========
export interface ConsultationRequest {
  // 相談内容
  content: string;
  category?: ConsultationCategory;
  urgency?: UrgencyLevel;

  // コンテキスト
  branchId?: string;
  relatedDocumentIds?: string[];  // 関連する申請・経費・ヒヤリハットなど

  // ifシミュレーション
  ifScenarios?: string[];  // 「もし〜だったら」のシナリオ
}

// ======== AI分析結果 - 論点 ========
export interface AnalysisIssue {
  id: string;
  title: string;           // 論点タイトル
  description: string;     // 詳細説明
  perspective: string;     // 視点（例：財務面、法的リスク、人員影響）
}

// ======== AI分析結果 - 選択肢 ========
export interface AnalysisOption {
  id: string;
  title: string;           // 選択肢タイトル
  description: string;     // 詳細説明
  pros: string[];          // メリット（最大3）
  cons: string[];          // デメリット（最大3）
  riskLevel: 'low' | 'medium' | 'high';
  estimatedImpact?: string; // 想定される影響
}

// ======== AI分析結果 ========
export interface AIAnalysis {
  // 1. 要約（事実のみ）
  summary: {
    facts: string[];       // 事実の箇条書き
    context: string;       // 背景・状況
  };

  // 2. 論点（最大3）
  issues: AnalysisIssue[];

  // 3. 選択肢（最大3）
  options: AnalysisOption[];

  // 4. 判断類似度
  judgmentSimilarity: {
    percentage: number;    // 類似度（0-100）
    similarCases: Array<{
      id: string;
      title: string;
      decision: string;
      date: string;
      similarity: number;
    }>;
    note: string;          // 類似度についての補足
  };

  // 5. エスカレーション文下書き
  escalationDraft: {
    subject: string;       // 件名
    body: string;          // 本文
    keyPoints: string[];   // 要点（最大3）
    suggestedAction: string; // 提案アクション（断定しない形式）
  };

  // AIの注意事項
  disclaimer: string;      // 「この分析は参考情報です。最終判断は吉田が行います。」など

  // メタデータ
  analyzedAt: Date;
  modelUsed: string;
  tokensUsed?: number;
}

// ======== 相談セッション ========
export interface ConsultationSession {
  id: string;
  tenantId: string;

  // 相談者
  consultantId: string;    // user ID
  consultantName: string;
  consultantRole: 'manager' | 'executive';
  branchId?: string;

  // 相談内容
  request: ConsultationRequest;

  // AI分析結果
  analysis?: AIAnalysis;

  // エスカレーション
  escalation: {
    status: EscalationStatus;
    sentAt?: Date;
    sentTo?: string;       // 通常は吉田
    acknowledgedAt?: Date;
    resolvedAt?: Date;
    resolution?: string;
  };

  // ステータス
  status: 'pending' | 'analyzing' | 'analyzed' | 'escalated' | 'resolved';

  // タイムスタンプ
  createdAt: Date;
  updatedAt: Date;
}

// ======== 吉田判断ログ（読み取り専用参照） ========
export interface YoshidaJudgmentLog {
  id: string;
  tenantId: string;

  // 判断内容
  title: string;
  category: ConsultationCategory;
  situation: string;       // 状況・背景
  decision: string;        // 判断内容
  reasoning: string;       // 判断理由
  outcome?: string;        // 結果・フォローアップ

  // 関連情報
  relatedBranchId?: string;
  relatedDocumentIds?: string[];

  // キーワード（検索・類似度計算用）
  keywords: string[];

  // タイムスタンプ
  decidedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ======== ifシミュレーション ========
export interface IfSimulation {
  id: string;
  sessionId: string;       // 相談セッションID

  // シナリオ
  scenario: string;        // 「もし〜だったら」
  assumptions: string[];   // 前提条件

  // 分析結果
  analysis: {
    possibleOutcomes: Array<{
      outcome: string;
      probability: 'low' | 'medium' | 'high';
      impact: string;
    }>;
    risks: string[];
    considerations: string[];
  };

  // タイムスタンプ
  createdAt: Date;
}

// ======== 吉田通知 ========
export interface YoshidaNotification {
  id: string;
  tenantId: string;

  // 送信元
  sessionId: string;
  fromUserId: string;
  fromUserName: string;
  fromBranchId?: string;

  // 通知タイプ
  type: 'escalation' | 'urgent' | 'fyi';
  priority: UrgencyLevel;

  // 内容
  subject: string;
  summary: string;
  keyPoints: string[];

  // ステータス
  status: 'unread' | 'read' | 'acknowledged' | 'resolved';
  readAt?: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  response?: string;

  // タイムスタンプ
  createdAt: Date;
}

// ======== APIリクエスト/レスポンス ========

// 相談開始リクエスト
export interface StartConsultationRequest {
  content: string;
  category?: ConsultationCategory;
  urgency?: UrgencyLevel;
  branchId?: string;
  relatedDocumentIds?: string[];
  ifScenarios?: string[];
}

// 相談開始レスポンス
export interface StartConsultationResponse {
  success: boolean;
  session?: ConsultationSession;
  error?: string;
}

// エスカレーション送信リクエスト
export interface SendEscalationRequest {
  sessionId: string;
  subject?: string;        // カスタム件名（省略時はAI生成を使用）
  body?: string;           // カスタム本文（省略時はAI生成を使用）
  priority?: UrgencyLevel;
}

// エスカレーション送信レスポンス
export interface SendEscalationResponse {
  success: boolean;
  notificationId?: string;
  error?: string;
}

// ifシミュレーションリクエスト
export interface IfSimulationRequest {
  sessionId: string;
  scenario: string;
  assumptions?: string[];
}

// ifシミュレーションレスポンス
export interface IfSimulationResponse {
  success: boolean;
  simulation?: IfSimulation;
  error?: string;
}

// 判断ログ検索リクエスト
export interface SearchJudgmentLogsRequest {
  query?: string;
  category?: ConsultationCategory;
  branchId?: string;       // 自分の拠点のみ
  limit?: number;
  offset?: number;
}

// 判断ログ検索レスポンス
export interface SearchJudgmentLogsResponse {
  success: boolean;
  logs: YoshidaJudgmentLog[];
  total: number;
  error?: string;
}

// ======== コレクション名 ========
export const CONSULTATION_SESSIONS_COLLECTION = 'consultation_sessions';
export const YOSHIDA_JUDGMENT_LOGS_COLLECTION = 'yoshida_judgment_logs';
export const YOSHIDA_NOTIFICATIONS_COLLECTION = 'yoshida_notifications';
export const IF_SIMULATIONS_COLLECTION = 'if_simulations';

// ======== 定数 ========
export const MAX_ISSUES = 3;
export const MAX_OPTIONS = 3;
export const MAX_SIMILAR_CASES = 5;

// ======== AIプロンプトルール ========
export const AI_RULES = {
  // 断定禁止
  NO_DEFINITIVE: [
    '〜です',
    '〜でしょう',
    '〜すべきです',
    '〜しなければなりません',
  ],
  // 命令禁止
  NO_COMMANDS: [
    '〜してください',
    '〜しなさい',
    '〜すること',
  ],
  // 感情評価禁止
  NO_EMOTIONAL: [
    '良い',
    '悪い',
    '素晴らしい',
    '問題です',
    '心配です',
  ],
  // 推奨表現
  RECOMMENDED_EXPRESSIONS: [
    '〜と考えられます',
    '〜の可能性があります',
    '〜という選択肢があります',
    '〜という視点もあります',
    '検討の余地があるかもしれません',
  ],
};
