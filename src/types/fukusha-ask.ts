// ======== ふくしゃに聞く（判断相談・AI一次整理）型定義 ========
//
// 【DHP.OS.HUB ブランド思想】
// 判断は、ひとりで背負わない。責任は、最後まで引き受ける。
// DHPは、判断と責任のOSである。
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
// decision_logs は評価・査定のためのテーブルではない。
// 判断がどのように行われたかを記録し、
// 次の判断を楽にするためのDHP.OS.HUBのOS資産である。
//
// 現場に判断を背負わせない。管理職に孤独を背負わせない。失敗を人のせいにしない。

/**
 * 判断カテゴリ
 */
export type DecisionCategory =
  | 'human'           // 人事・採用・離職
  | 'operation'       // 業務・オペレーション
  | 'user_family'     // 利用者・ご家族対応
  | 'complaint'       // クレーム・苦情
  | 'exception'       // 例外対応
  | 'other';          // その他

export const DECISION_CATEGORY_LABELS: Record<DecisionCategory, string> = {
  human: '人事・採用・離職',
  operation: '業務・オペレーション',
  user_family: '利用者・ご家族対応',
  complaint: 'クレーム・苦情',
  exception: '例外対応',
  other: 'その他',
};

/**
 * 参照情報ソース
 */
export type DecisionReferenceSource =
  | 'notebooklm'          // NotebookLM
  | 'ai_summary'          // AI要約
  | 'past_decision'       // 過去の判断
  | 'verbal_confirmation' // 口頭確認
  | 'none';               // なし

/**
 * 元データソースタイプ
 */
export type DecisionSourceType =
  | 'fukusha_ask'    // ふくしゃに聞く
  | 'manual';        // 手動登録

/**
 * 承認ステータス
 */
export type DecisionApprovalStatus =
  | 'none'              // なし
  | 'verbal_ok'         // 口頭OK
  | 'formally_approved'; // 正式承認

/**
 * 共有範囲
 */
export type DecisionVisibility =
  | 'private'       // 自分のみ
  | 'managers'      // 管理者
  | 'organization'; // 組織全体

/**
 * 判断ログ
 *
 * 質問→AI整理→人の判断という流れを組織の資産として残す
 * 評価・査定のためではなく、判断を属人化させないためのOS資産
 */
export interface DecisionLog {
  id: string;
  tenantId: string;

  // 判断主体（個人名を前に出さず「役割」を残す思想）
  decidedByUserId: string;
  decidedByRole: string;  // admin / manager / director など

  // 判断カテゴリ
  category: DecisionCategory;

  // 判断の中身（OSの心臓）
  situation: string;   // 何が起きたか（事実）
  decision: string;    // 何を決めたか
  reason: string;      // なぜそう判断したか

  // 参照情報
  referenceSource: DecisionReferenceSource;

  // 元質問との紐付け
  sourceType: DecisionSourceType;
  sourceId?: string;  // fukusha-ask.id など

  // 承認・責任の扱い
  approvalStatus: DecisionApprovalStatus;

  // 共有範囲（思想反映）
  visibility: DecisionVisibility;

  // タイムスタンプ
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 判断ログ作成入力（ふくしゃに聞く経由）
 */
export interface CreateDecisionLogFromAskInput {
  // 元質問情報
  sourceId: string;
  questionContent: string;
  questionCategory: FukushaQuestionCategory;

  // AI整理結果
  aiSummary: string;
  aiKeyPoints: string[];

  // 判断内容
  decision: string;      // 何を決めたか（返信内容）
  reason?: string;       // なぜそう判断したか（任意メモ）

  // オプション
  category?: DecisionCategory;
  visibility?: DecisionVisibility;
}

/**
 * 判断ログ作成入力（手動登録用）
 */
export interface CreateDecisionLogInput {
  category: DecisionCategory;
  situation: string;
  decision: string;
  reason: string;
  referenceSource?: DecisionReferenceSource;
  approvalStatus?: DecisionApprovalStatus;
  visibility?: DecisionVisibility;
}

/**
 * 判断ログフィルター
 */
export interface DecisionLogFilter {
  category?: DecisionCategory;
  decidedByUserId?: string;
  visibility?: DecisionVisibility;
  sourceType?: DecisionSourceType;
  limit?: number;
  offset?: number;
}
