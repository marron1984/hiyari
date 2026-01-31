// ======== ふくしゃに聞く（AI副社長 質問箱）型定義 ========

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
