// ======== ふくしゃに聞く（判断相談・AI一次整理）型定義 ========
//
// 【AA.OS.HUB ブランド思想】
// 判断は、ひとりで背負わない。責任は、最後まで引き受ける。
// AAは、判断と責任のOSである。
//
// この機能は「質問→整理→人の判断→組織に残る」流れを実現する。
// 判断を個人に背負わせないための"仕組み（OS）"の一部である。

/**
 * 質問ステータス
 */
export type FukushaQuestionStatus =
  | 'pending'      // 投稿済み・AI処理待ち
  | 'processed'    // AI処理完了・返信待ち
  | 'replied'      // 返信済み
  | 'archived';    // アーカイブ

/**
 * 質問カテゴリ
 */
export type FukushaQuestionCategory =
  | 'work'         // 業務・仕事について
  | 'career'       // キャリア・将来について
  | 'workplace'    // 職場環境について
  | 'suggestion'   // 提案・アイデア
  | 'other';       // その他

export const FUKUSHA_CATEGORY_LABELS: Record<FukushaQuestionCategory, string> = {
  work: '業務・仕事について',
  career: 'キャリア・将来について',
  workplace: '職場環境について',
  suggestion: '提案・アイデア',
  other: 'その他',
};

/**
 * 質問投稿
 */
export interface FukushaQuestion {
  id: string;
  tenantId: string;

  // 投稿者情報
  userId: string;
  userName: string;
  userBaseId?: string;
  userBaseName?: string;
  isAnonymous: boolean;  // 匿名投稿フラグ

  // 質問内容
  category: FukushaQuestionCategory;
  title: string;         // 件名（任意）
  content: string;       // 質問本文

  // ステータス
  status: FukushaQuestionStatus;

  // AI処理結果
  aiProcessedAt?: Date;
  aiSummary?: string;           // 要約
  aiKeyPoints?: string[];       // 論点整理
  aiDraftReply?: string;        // 返信下書き
  aiSuggestedTone?: string;     // 推奨トーン（励まし、説明、共感など）

  // 返信
  repliedAt?: Date;
  repliedBy?: string;
  repliedByName?: string;
  replyContent?: string;        // 実際の返信内容
  replyNote?: string;           // 社内メモ（投稿者には見せない）

  // タイムスタンプ
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 質問投稿リクエスト
 */
export interface CreateFukushaQuestionInput {
  category: FukushaQuestionCategory;
  title?: string;
  content: string;
  isAnonymous: boolean;
}

/**
 * AI処理結果
 */
export interface FukushaAIProcessResult {
  summary: string;
  keyPoints: string[];
  draftReply: string;
  suggestedTone: string;
}

/**
 * 返信送信リクエスト
 */
export interface SendFukushaReplyInput {
  questionId: string;
  replyContent: string;
  replyNote?: string;
}

/**
 * 質問一覧フィルター
 */
export interface FukushaQuestionFilter {
  status?: FukushaQuestionStatus;
  category?: FukushaQuestionCategory;
  isAnonymous?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * 質問統計
 */
export interface FukushaQuestionStats {
  total: number;
  pending: number;
  processed: number;
  replied: number;
  avgResponseTimeHours: number;
}

/**
 * 返信送信リクエスト（判断ログ連携オプション付き）
 */
export interface SendFukushaReplyInputWithLog extends SendFukushaReplyInput {
  saveToDecisionLog?: boolean;  // 判断ログに保存するかどうか
}

// ======== 判断ログ（Decision Log）========
//
// 判断ログは「正解の記録」ではない。
// 判断がどのように行われたかを残し、次の判断を楽にするためのOS資産である。
// 現場に判断を背負わせない。管理職に孤独を背負わせない。失敗を人のせいにしない。

/**
 * 判断ログ
 *
 * 質問→AI整理→人の判断という流れを組織の資産として残す
 */
export interface DecisionLog {
  id: string;
  tenantId: string;

  // 元の質問への参照
  sourceQuestionId: string;
  sourceType: 'fukusha_ask';  // 将来的に他ソースも対応可能

  // 質問情報（スナップショット）
  questionContent: string;
  questionCategory: FukushaQuestionCategory;
  questionCreatedAt: Date;

  // AI整理結果（スナップショット）
  aiSummary: string;
  aiKeyPoints: string[];

  // 最終判断（人の返信）
  decisionContent: string;      // 管理者の最終返信
  decisionMakerUserId: string;  // 判断者
  decisionMakerName: string;    // 判断者名
  decisionNote?: string;        // 判断時の補足メモ

  // メタ情報
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 判断ログ作成入力
 */
export interface CreateDecisionLogInput {
  sourceQuestionId: string;
  questionContent: string;
  questionCategory: FukushaQuestionCategory;
  questionCreatedAt: Date;
  aiSummary: string;
  aiKeyPoints: string[];
  decisionContent: string;
  decisionNote?: string;
}

/**
 * 判断ログフィルター
 */
export interface DecisionLogFilter {
  category?: FukushaQuestionCategory;
  decisionMakerUserId?: string;
  limit?: number;
  offset?: number;
}
